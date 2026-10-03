import { detectFaceOnCanvas, type FaceBox } from "./mediapipe";
import { personMatte } from "./personMatte";

/**
 * Auto-framing for passport photos.
 *
 * The naive approach — centre the crop on the face detector's bounding box — cuts the top of
 * the head off, because BlazeFace's box spans roughly forehead-to-chin and excludes the hair.
 * Scaling that box by a fixed factor guesses badly on anyone whose hair is taller or flatter
 * than average.
 *
 * Instead we measure the head: the segmentation mask (which has a dedicated hair class) tells
 * us where the crown actually is, and the face box gives us the chin and the horizontal centre.
 * The frame is then laid out to the proportions passport/visa photos are checked against.
 */

/** Head height (crown → chin) as a fraction of the photo height, when none is specified. */
const DEFAULT_HEAD_HEIGHT_FRACTION = 0.65;

/**
 * Empty space above the crown, as a fraction of the photo height.
 *
 * Scaled with the head: a country that wants a small head in frame (Canada) needs more
 * space above it than one that wants the head to fill the frame (Australia), otherwise the
 * face drifts to the bottom of the photo and the eye line falls out of tolerance.
 */
function topMarginFor(headFraction: number): number {
  return (1 - headFraction) * 0.32;
}

/** Least space kept above the hair when the eye line decides the framing. */
const MIN_CROWN_GAP = 0.03;

/** The face box bottom sits a little above the chin, so extend it slightly. */
const CHIN_FACTOR = 1.04;

/** Alpha above which a mask pixel counts as "person" when hunting for the crown. */
const CROWN_ALPHA = 0.35;

/** A row must be at least this covered (fraction of the search band) to count as head. */
const CROWN_ROW_COVERAGE = 0.12;

/** Consecutive covered rows required, to reject speckle in the mask. */
const CROWN_ROW_RUN = 2;

/** Search band width around the face centre, as a multiple of the face box width. */
const CROWN_BAND_WIDTH = 1.8;

/** Longest edge used for analysis. Detection/segmentation don't need full resolution. */
const ANALYSIS_MAX_EDGE = 640;

export type HeadMetrics = {
  /** Face detector box, in source-image pixels. */
  faceBox: { x: number; y: number; w: number; h: number };
  /** Top of the hair, in source-image pixels. */
  crownY: number;
  /** Estimated chin line, in source-image pixels. */
  chinY: number;
  /** Horizontal centre of the head, in source-image pixels. */
  centerX: number;
  /** Eye line when the detector reported keypoints, in source-image pixels. */
  eyeY?: number;
  /** True when crownY came from the mask rather than a fallback estimate. */
  crownFromMask: boolean;
};

export type Frame = { x: number; y: number; width: number; height: number };

function drawToCanvas(bitmap: ImageBitmap, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { canvas, scale };
}

/**
 * Walk down the mask looking for the first run of rows that is meaningfully covered by the
 * person, within a band centred on the face. That row is the top of the hair.
 */
function findCrownRow(
  mask: { width: number; height: number; data: Float32Array },
  face: { x: number; y: number; w: number; h: number },
  analysisW: number,
  analysisH: number
): number | null {
  const sx = mask.width / analysisW;
  const sy = mask.height / analysisH;

  const faceCx = (face.x + face.w / 2) * sx;
  const bandHalf = (face.w * CROWN_BAND_WIDTH * sx) / 2;

  const x0 = Math.max(0, Math.floor(faceCx - bandHalf));
  const x1 = Math.min(mask.width - 1, Math.ceil(faceCx + bandHalf));
  const bandWidth = x1 - x0 + 1;
  if (bandWidth <= 0) return null;

  // The crown cannot be below the middle of the face box.
  const searchBottom = Math.min(mask.height - 1, Math.round((face.y + face.h / 2) * sy));
  const needed = Math.max(2, Math.round(bandWidth * CROWN_ROW_COVERAGE));

  let run = 0;
  for (let y = 0; y <= searchBottom; y++) {
    let covered = 0;
    const rowOffset = y * mask.width;
    for (let x = x0; x <= x1; x++) {
      if (mask.data[rowOffset + x] >= CROWN_ALPHA) covered++;
    }

    if (covered >= needed) {
      run++;
      if (run >= CROWN_ROW_RUN) {
        const firstRow = y - (CROWN_ROW_RUN - 1);
        return firstRow / sy; // back to analysis-canvas pixels
      }
    } else {
      run = 0;
    }
  }

  return null;
}

/**
 * Measure the head in a source image. Returns null when no face is found.
 */
export async function measureHead(bitmap: ImageBitmap, cacheKey = "autoframe"): Promise<HeadMetrics | null> {
  const { canvas, scale } = drawToCanvas(bitmap, ANALYSIS_MAX_EDGE);

  const face: FaceBox | null = await detectFaceOnCanvas(canvas);
  if (!face) return null;

  let crownY: number | null = null;
  let crownFromMask = false;
  try {
    // The same matte used for background removal. It resolves hair far better than the old
    // mask, which is exactly what finding the top of the head depends on.
    const { mask } = await personMatte(canvas, cacheKey);
    crownY = findCrownRow(mask, face, canvas.width, canvas.height);
  } catch {
    crownY = null;
  }

  // Guard against the mask missing dark hair on a dark background: the crown has to sit
  // clearly above the face box, otherwise we would frame too tightly and clip the head.
  const highestPlausibleCrown = face.y - face.h * 0.25;
  if (crownY !== null && crownY <= highestPlausibleCrown) {
    crownFromMask = true;
  } else {
    crownY = face.y - face.h * 0.5;
  }

  const chinY = face.y + face.h * CHIN_FACTOR;

  let centerX = face.x + face.w / 2;
  let eyeY: number | undefined;
  if (face.leftEye && face.rightEye) {
    // Keypoints are normalised to the analysed canvas.
    const lx = face.leftEye.x * canvas.width;
    const rx = face.rightEye.x * canvas.width;
    const ly = face.leftEye.y * canvas.height;
    const ry = face.rightEye.y * canvas.height;
    centerX = (lx + rx) / 2;
    eyeY = (ly + ry) / 2;
  }

  const toImage = 1 / scale;
  return {
    faceBox: { x: face.x * toImage, y: face.y * toImage, w: face.w * toImage, h: face.h * toImage },
    crownY: crownY * toImage,
    chinY: chinY * toImage,
    centerX: centerX * toImage,
    eyeY: eyeY === undefined ? undefined : eyeY * toImage,
    crownFromMask
  };
}

/**
 * Lay out the crop rectangle around a measured head, in source-image pixels.
 *
 * `headFraction` is the chin-to-crown height the destination document asks for, as a
 * fraction of the photo height — 0.48 for Canada, 0.75 for Australia, and so on.
 *
 * The vertical position follows the most specific rule the document publishes: the eye
 * line (measured up from the bottom, as the US publishes it), then the space above the
 * hair, then a gap derived from the head size. Placing by eye line alone could push the
 * crown out of frame, so a sliver of space above the hair is always kept.
 *
 * The result is clamped to the image, shrinking rather than sliding the head off-centre.
 */
export function computeFrame(
  metrics: HeadMetrics,
  aspect: number,
  imageW: number,
  imageH: number,
  headFraction: number = DEFAULT_HEAD_HEIGHT_FRACTION,
  placement: { crownGap?: number; eyeLine?: { min: number; max: number } } = {}
): Frame {
  const headHeight = Math.max(1, metrics.chinY - metrics.crownY);
  const target = Math.min(0.9, Math.max(0.3, headFraction));

  let height = headHeight / target;
  let width = height * aspect;

  // Shrink to fit the source image, preserving the aspect ratio.
  if (width > imageW) {
    width = imageW;
    height = width / aspect;
  }
  if (height > imageH) {
    height = imageH;
    width = height * aspect;
  }

  let x = metrics.centerX - width / 2;
  let y = metrics.crownY - (placement.crownGap ?? topMarginFor(target)) * height;

  const { eyeLine } = placement;
  if (eyeLine && metrics.eyeY !== undefined) {
    const eyeFromTop = 1 - (eyeLine.min + eyeLine.max) / 2;
    const byEyes = metrics.eyeY - eyeFromTop * height;
    y = Math.min(byEyes, metrics.crownY - MIN_CROWN_GAP * height);
  }

  x = Math.max(0, Math.min(imageW - width, x));
  y = Math.max(0, Math.min(imageH - height, y));

  return { x, y, width, height };
}
