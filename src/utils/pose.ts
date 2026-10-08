import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * How the face sits in the photo: tilted, turned, nodding, eyes shut, mouth open, lit from
 * one side.
 *
 * These are the rejections a correctly sized photo still collects, and the face detector
 * used for framing can't see any of them — six keypoints say where a face is, not how it is
 * held. The face landmarker fits a 478-point mesh, a head pose and a set of expression
 * scores, which is enough to measure each one.
 *
 * Only roll (head tilted towards a shoulder) can be fixed afterwards, by rotating the photo
 * level — see utils/straighten.ts. The rest can only be reported, so the user knows to
 * retake before an official does it for them.
 */

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

/** Longest edge analysed. The landmarker crops and resizes the face itself. */
const ANALYSIS_MAX_EDGE = 1024;

/** A second face this large next to the main one is a second person, not a poster behind. */
const SECOND_FACE_AREA = 0.15;

// Mesh indices (MediaPipe canonical face model). "Right"/"left" are the subject's own.
const RIGHT_EYE_CORNERS = [33, 133];
const LEFT_EYE_CORNERS = [362, 263];
const NOSE_TIP = 1;
const RIGHT_CHEEK = 50;
const LEFT_CHEEK = 280;
const FACE_EDGE_RIGHT = 234;
const FACE_EDGE_LEFT = 454;

export type FacePose = {
  /** Faces large enough to be a second person in the photo, including the main one. */
  faces: number;
  /** Smaller faces as well — posters, people in the distance. */
  allFaces: number;
  /**
   * Angle of the eye line in degrees, clockwise in image space (y down). Positive when the
   * eye on the right of the picture sits lower. Rotating the photo by -roll levels it.
   */
  roll: number;
  /** Head turned left or right, degrees, unsigned. */
  yaw: number;
  /** Chin raised or lowered, degrees, unsigned. */
  pitch: number;
  /** 0..1, the more closed of the two eyes. */
  eyesClosed: number;
  /** 0..1 */
  mouthOpen: number;
  /** 0..1, the average of both sides. */
  smile: number;
  /** Mean luminance 0..255 of each cheek, as seen in the picture (left of image, right of image). */
  cheeks: { left: number; right: number };
  /** Midpoint between the eyes, in source-image pixels — the pivot for straightening. */
  eyeMid: { x: number; y: number };
};

let landmarker: Promise<FaceLandmarker> | null = null;

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  landmarker ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: "IMAGE",
      numFaces: 3,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true
    });
  })();
  // A failed download shouldn't pin every later photo to the failure.
  landmarker.catch(() => { landmarker = null; });
  return landmarker;
}

const DEG = 180 / Math.PI;

function mean(points: NormalizedLandmark[], ids: number[], w: number, h: number) {
  let x = 0;
  let y = 0;
  for (const i of ids) {
    x += points[i].x * w;
    y += points[i].y * h;
  }
  return { x: x / ids.length, y: y / ids.length };
}

/** Area of a face's landmark bounding box, normalised. Used to tell a second person from a poster. */
function faceArea(points: NormalizedLandmark[]): number {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

/**
 * Yaw and pitch from the head-pose matrix.
 *
 * Only the size of each angle is used, which is what makes this safe: the face's forward
 * axis is read from the rotation, and its sideways and vertical lean are the same whether
 * the matrix arrives row- or column-major, and whichever way its axes point.
 */
function turnAndNod(data: number[]): { yaw: number; pitch: number } {
  const fx = data[8];
  const fy = data[9];
  const fz = Math.abs(data[10]) || 1e-6;
  return { yaw: Math.abs(Math.atan2(fx, fz) * DEG), pitch: Math.abs(Math.atan2(fy, fz) * DEG) };
}

/** Mean luminance of a square patch centred on a point. */
function patchLuminance(img: ImageData, cx: number, cy: number, half: number): number {
  const x0 = Math.max(0, Math.round(cx - half));
  const x1 = Math.min(img.width - 1, Math.round(cx + half));
  const y0 = Math.max(0, Math.round(cy - half));
  const y1 = Math.min(img.height - 1, Math.round(cy + half));
  let sum = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4;
      sum += 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
      n++;
    }
  }
  return n ? sum / n : 0;
}

function score(categories: { categoryName: string; score: number }[], name: string): number {
  return categories.find(c => c.categoryName === name)?.score ?? 0;
}

async function analyse(bitmap: ImageBitmap): Promise<FacePose | null> {
  const scale = Math.min(1, ANALYSIS_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const fl = await getFaceLandmarker();
  const res = fl.detect(canvas);
  if (!res.faceLandmarks.length) return null;

  // The main face is the largest; framing makes the same choice.
  const areas = res.faceLandmarks.map(faceArea);
  const main = areas.indexOf(Math.max(...areas));
  const points = res.faceLandmarks[main];
  const W = canvas.width;
  const H = canvas.height;

  // The eye line from the eye corners, which don't move with gaze the way the irises do.
  const a = mean(points, RIGHT_EYE_CORNERS, W, H);
  const b = mean(points, LEFT_EYE_CORNERS, W, H);
  const [l, r] = a.x <= b.x ? [a, b] : [b, a];
  const roll = Math.atan2(r.y - l.y, r.x - l.x) * DEG;

  const matrix = res.facialTransformationMatrixes?.[main]?.data;
  const { yaw, pitch } = matrix && matrix.length >= 16 ? turnAndNod(matrix) : noseTurn(points, W);

  const shapes = res.faceBlendshapes?.[main]?.categories ?? [];

  // Cheek patches sized to the face, so a distant face isn't sampled into the background.
  const faceWidth = Math.hypot(
    (points[FACE_EDGE_LEFT].x - points[FACE_EDGE_RIGHT].x) * W,
    (points[FACE_EDGE_LEFT].y - points[FACE_EDGE_RIGHT].y) * H
  );
  const half = Math.max(2, faceWidth * 0.06);
  const img = ctx.getImageData(0, 0, W, H);
  const c1 = { x: points[RIGHT_CHEEK].x * W, y: points[RIGHT_CHEEK].y * H };
  const c2 = { x: points[LEFT_CHEEK].x * W, y: points[LEFT_CHEEK].y * H };
  const [cl, cr] = c1.x <= c2.x ? [c1, c2] : [c2, c1];

  return {
    faces: areas.filter(area => area >= areas[main] * SECOND_FACE_AREA).length,
    allFaces: areas.length,
    roll,
    yaw,
    pitch,
    eyesClosed: Math.max(score(shapes, "eyeBlinkLeft"), score(shapes, "eyeBlinkRight")),
    mouthOpen: score(shapes, "jawOpen"),
    smile: (score(shapes, "mouthSmileLeft") + score(shapes, "mouthSmileRight")) / 2,
    cheeks: { left: patchLuminance(img, cl.x, cl.y, half), right: patchLuminance(img, cr.x, cr.y, half) },
    eyeMid: { x: (l.x + r.x) / 2 / scale, y: (l.y + r.y) / 2 / scale }
  };
}

/** Fallback when no pose matrix comes back: how far the nose sits off the middle of the face. */
function noseTurn(points: NormalizedLandmark[], W: number): { yaw: number; pitch: number } {
  const left = Math.min(points[FACE_EDGE_RIGHT].x, points[FACE_EDGE_LEFT].x) * W;
  const right = Math.max(points[FACE_EDGE_RIGHT].x, points[FACE_EDGE_LEFT].x) * W;
  const offset = (points[NOSE_TIP].x * W - (left + right) / 2) / Math.max(1, (right - left) / 2);
  return { yaw: Math.abs(Math.asin(Math.max(-1, Math.min(1, offset))) * DEG), pitch: 0 };
}

// One analysis per bitmap: the crop step, the checklist and the checker all ask about the
// same photo, and the answer can't change.
const cache = new WeakMap<ImageBitmap, Promise<FacePose | null>>();

/** Analyse the largest face in a photo. Resolves to null when there is no face. */
export function analysePose(bitmap: ImageBitmap): Promise<FacePose | null> {
  let pending = cache.get(bitmap);
  if (!pending) {
    pending = analyse(bitmap);
    cache.set(bitmap, pending);
    pending.catch(() => cache.delete(bitmap));
  }
  return pending;
}
