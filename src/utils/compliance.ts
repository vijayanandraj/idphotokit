import type { BackgroundSpec, PhotoSpec } from "../types";
import type { HeadMetrics } from "./autoframe";
import type { FacePose } from "./pose";
import { backgroundsFor, DEFAULT_HEAD, formatSize, presetTitle, type Preset } from "./presets";
import { toInches } from "./units";

/**
 * Checks the finished photo against the selected country's published requirements.
 *
 * Everything here is measured from numbers the app already has — the crop rectangle, the
 * measured head, the chosen background — so the report costs nothing to produce. It exists
 * because the app was silently doing the right thing: it framed to each country's head
 * height and never said so, which left the user to guess whether the result would be
 * accepted at exactly the moment they were about to pay for prints.
 *
 * A "pass" means the measurable geometry is in range. It is not a guarantee of acceptance:
 * expression, glasses, lighting and shadow are judged by a person and cannot be checked here.
 */

export type CheckStatus = "pass" | "warn" | "fail" | "unknown";

export type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  /** What was measured, in the units the user is working in. */
  value: string;
  /** What the authority asks for, where there is a published figure. */
  requirement?: string;
  /** How to fix it. Only shown when the check isn't a pass. */
  advice?: string;
};

/**
 * Where the head landed, as fractions of the finished photo measured from its top-left
 * corner. Drawn as the dimension markings on the preview; absent when the head could not be
 * measured.
 */
export type Geometry = {
  crown: number;
  chin: number;
  centerX: number;
  eye?: number;
};

export type Report = {
  checks: Check[];
  geometry?: Geometry;
  /** Worst status across the checks. */
  verdict: CheckStatus;
  passed: number;
  total: number;
};

type Rect = { x: number; y: number; width: number; height: number };

export type ComplianceInput = {
  photo: PhotoSpec;
  preset?: Preset;
  bg: BackgroundSpec;
  /** The crop rectangle in source-image pixels, as react-easy-crop reports it. */
  crop?: Rect;
  /** Degrees. A rotated crop makes the head measurements approximate, so they're withheld. */
  rotation: number;
  /** Measured on the source image. Absent when no face was found. */
  head?: HeadMetrics | null;
  /** How the face is held. Undefined while still being measured, null when no face was found. */
  pose?: FacePose | null;
  /** Output size in pixels. */
  outPx: { w: number; h: number };
};

/** What the framing checks need, shared with the checker for finished photos (utils/photoCheck.ts). */
export type FramingInput = Pick<ComplianceInput, "head" | "crop" | "photo" | "preset" | "rotation"> & {
  /**
   * How to fix a framing problem. The wizard points at its crop step; the checker, which
   * can't re-crop a finished photo, points at the wizard instead.
   */
  reframe?: string;
};

/** The photo's printed height in millimetres, whatever unit it's expressed in. */
function heightMm(photo: PhotoSpec): number {
  if (photo.unit === "px") return (photo.height / photo.dpi) * 25.4;
  return toInches(photo.height, photo.unit) * 25.4;
}

function mm(value: number): string {
  return `${value.toFixed(1)} mm`;
}

/**
 * A vertical distance given as a fraction of the photo height, in the photo's own terms:
 * millimetres for a print, pixels for an upload-only document.
 */
function length(fraction: number, photo: PhotoSpec): string {
  return photo.unit === "px" ? `${Math.round(fraction * photo.height)} px` : mm(fraction * heightMm(photo));
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Hex comparison that survives case and the odd shorthand. */
function sameColor(a: string, b: string): boolean {
  const norm = (c: string) => {
    const h = c.trim().toLowerCase().replace("#", "");
    return h.length === 3 ? h.split("").map(ch => ch + ch).join("") : h;
  };
  return norm(a) === norm(b);
}

function worst(checks: Check[]): CheckStatus {
  if (checks.some(c => c.status === "fail")) return "fail";
  if (checks.some(c => c.status === "warn")) return "warn";
  if (checks.some(c => c.status === "unknown")) return "unknown";
  return "pass";
}

function sizeCheck(photo: PhotoSpec, preset?: Preset): Check {
  const value = photo.unit === "px" ? formatSize(photo) : `${formatSize(photo)} at ${photo.dpi} DPI`;
  if (!preset) {
    return {
      id: "size",
      label: "Size",
      status: "unknown",
      value,
      advice: "Custom size — check it against the authority's own guidance."
    };
  }

  const matches =
    photo.unit === preset.unit &&
    Math.abs(photo.width - preset.width) < 0.05 &&
    Math.abs(photo.height - preset.height) < 0.05;

  return {
    id: "size",
    label: "Size",
    status: matches ? "pass" : "warn",
    value,
    requirement: `${formatSize(preset)} for ${presetTitle(preset)}`,
    advice: matches ? undefined : `You have changed the size away from the ${presetTitle(preset)} preset.`
  };
}

/**
 * Catches the one defect that survives every other step: a crop smaller than the output,
 * which canvas will happily interpolate into a soft photo that a print counter rejects.
 */
function resolutionCheck(
  crop: Rect | undefined,
  outPx: { w: number; h: number },
  dpi: number,
  unit: PhotoSpec["unit"]
): Check {
  const value = `${outPx.w} × ${outPx.h} px`;

  if (unit !== "px" && dpi < 300) {
    return {
      id: "resolution",
      label: "Resolution",
      status: "warn",
      value,
      requirement: "300 DPI or higher",
      advice: `${dpi} DPI is low for print. Raise it on step 1.`
    };
  }

  if (!crop) return { id: "resolution", label: "Resolution", status: "unknown", value };

  const upscale = outPx.h / crop.height;
  if (upscale <= 1.1) {
    return { id: "resolution", label: "Resolution", status: "pass", value, requirement: "no upscaling" };
  }

  return {
    id: "resolution",
    label: "Resolution",
    status: upscale > 1.75 ? "fail" : "warn",
    value: `${value} — upscaled ${upscale.toFixed(1)}×`,
    requirement: "no upscaling",
    advice:
      "The cropped area is smaller than the output, so detail is being invented. Use a " +
      "higher-resolution source photo, or zoom out and crop less tightly."
  };
}

export function headChecks(input: FramingInput): { checks: Check[]; geometry?: Geometry } {
  const { head, crop, photo, preset, rotation, reframe } = input;
  /** The fix for a framing fault: the wizard's own step, unless the caller says otherwise. */
  const fix = (onStep2: string) => reframe ?? onStep2;

  const unavailable = (advice: string): { checks: Check[] } => ({
    checks: [
      { id: "head", label: "Head height", status: "unknown", value: "Not measured", advice },
      { id: "headroom", label: "Space above head", status: "unknown", value: "Not measured" },
      { id: "centring", label: "Head centring", status: "unknown", value: "Not measured" }
    ]
  });

  if (!head || !crop) {
    return unavailable("No face was detected, so the framing could not be measured. Check it by eye.");
  }
  if (Math.abs(rotation) > 0.5) {
    return unavailable("The crop is rotated, which makes these measurements unreliable. Check them by eye.");
  }

  const range = preset?.head ?? DEFAULT_HEAD;

  // Head height, chin to crown, as a fraction of the frame.
  const fraction = (head.chinY - head.crownY) / crop.height;
  const slack = 0.02;
  const headStatus: CheckStatus =
    fraction >= range.min && fraction <= range.max
      ? "pass"
      : fraction >= range.min - slack && fraction <= range.max + slack
        ? "warn"
        : "fail";

  const headHeight: Check = {
    id: "head",
    label: "Head height",
    status: headStatus,
    value: `${length(fraction, photo)} (${pct(fraction)} of the frame)`,
    requirement: preset?.head?.target !== undefined
      ? `${length(preset.head.target, photo)}, within ${length(range.min, photo)}–${length(range.max, photo)}`
      : `${length(range.min, photo)}–${length(range.max, photo)}${preset?.head ? "" : " (ICAO default)"}`,
    advice:
      headStatus === "pass"
        ? undefined
        : fraction > range.max
          ? `The head is too large in frame. ${fix("Zoom out on step 2, or re-run Auto-frame.")}`
          : `The head is too small in frame. ${fix("Zoom in on step 2, or re-run Auto-frame.")}`
  };

  // Space above the crown. Negative means the top of the head is outside the crop.
  const above = (head.crownY - crop.y) / crop.height;
  const headroom = preset?.crownGap !== undefined
    ? publishedHeadroom(above, preset.crownGap, photo, reframe)
    : genericHeadroom(above, photo, reframe);

  // Horizontal centring.
  const offset = (head.centerX - (crop.x + crop.width / 2)) / crop.width;
  const centring: Check = {
    id: "centring",
    label: "Head centring",
    status: Math.abs(offset) < 0.025 ? "pass" : Math.abs(offset) < 0.06 ? "warn" : "fail",
    value:
      Math.abs(offset) < 0.01
        ? "Centred"
        : `${pct(Math.abs(offset))} ${offset > 0 ? "right" : "left"} of centre`,
    requirement: "centred horizontally",
    advice: Math.abs(offset) < 0.025 ? undefined : fix("Pan sideways on step 2, or re-run Auto-frame.")
  };

  const checks = [headHeight, headroom, centring];
  const eyeFromTop = head.eyeY === undefined ? undefined : (head.eyeY - crop.y) / crop.height;

  // Eye line, only when the detector gave us keypoints.
  if (eyeFromTop !== undefined) checks.push(eyeCheck(eyeFromTop, photo, preset, reframe));

  return {
    checks,
    geometry: {
      crown: above,
      chin: (head.chinY - crop.y) / crop.height,
      centerX: (head.centerX - crop.x) / crop.width,
      eye: eyeFromTop
    }
  };
}

/** Where a document publishes the gap above the hair, hold the photo to it. */
function publishedHeadroom(above: number, target: number, photo: PhotoSpec, reframe?: string): Check {
  const off = above - target;
  const status: CheckStatus =
    above < 0 ? "fail" : Math.abs(off) <= 0.03 ? "pass" : Math.abs(off) <= 0.06 ? "warn" : "fail";
  return {
    id: "headroom",
    label: "Space above head",
    status,
    value: above < 0 ? "Top of the head is cut off" : `${length(above, photo)} (${pct(above)})`,
    requirement: `about ${length(target, photo)} (${pct(target)})`,
    advice:
      status === "pass"
        ? undefined
        : above < 0
          ? `The top of the head is cut off. ${reframe ?? "Re-run Auto-frame on step 2, or pan down."}`
          : off > 0
            ? `Too much space above the head. ${reframe ?? "Re-run Auto-frame on step 2, or pan up."}`
            : `Too little space above the head. ${reframe ?? "Re-run Auto-frame on step 2, or pan down."}`
  };
}

/**
 * Where a document publishes no figure, only catch a crown that is clipped or a face sitting
 * far too low. Authorities rarely publish one, so this is the usual case.
 */
function genericHeadroom(above: number, photo: PhotoSpec, reframe?: string): Check {
  return {
    id: "headroom",
    label: "Space above head",
    status: above < 0 ? "fail" : above < 0.02 ? "warn" : above > 0.25 ? "warn" : "pass",
    value: above < 0 ? "Top of the head is cut off" : `${length(above, photo)} (${pct(above)})`,
    requirement: "a visible gap, up to a quarter of the frame",
    advice:
      above < 0
        ? `The top of the head is cut off. ${reframe ?? "Re-run Auto-frame on step 2, or pan down."}`
        : above < 0.02
          ? "The head almost touches the top edge. Most authorities want visible space above it."
          : above > 0.25
            ? "There is a lot of empty space above the head, which pushes the face low in frame."
            : undefined
  };
}

/**
 * The eye line, measured up from the bottom edge as authorities publish it.
 *
 * Held to the published band where there is one (the US: 1⅛–1⅜in on a 2in photo).
 * Otherwise reported as a guide: the tolerated band is wide and varies by country, so it
 * flags an obviously wrong framing rather than a borderline one.
 */
function eyeCheck(eyeFromTop: number, photo: PhotoSpec, preset?: Preset, reframe?: string): Check {
  const fromBottom = 1 - eyeFromTop;
  const band = preset?.eyeLine;
  const ok = band
    ? fromBottom >= band.min && fromBottom <= band.max
    : eyeFromTop >= 0.25 && eyeFromTop <= 0.55;
  return {
    id: "eyeline",
    label: "Eye line",
    status: ok ? "pass" : band ? "fail" : "warn",
    value: `${length(fromBottom, photo)} up from the bottom (${pct(fromBottom)})`,
    requirement: band
      ? `${length(band.min, photo)}–${length(band.max, photo)} up from the bottom`
      : "upper half of the frame",
    advice: ok ? undefined : `The eyes sit outside the band. ${reframe ?? "Re-run Auto-frame on step 2, or pan."}`
  };
}

/** Fixes offered for a pose fault, which differ between making a photo and checking one. */
export type PoseFixes = {
  /** The head is tilted and can be levelled. */
  tilt: string;
};

const MAKER_POSE_FIXES: PoseFixes = {
  tilt: "Turn on “Straighten head” on step 2, or retake it with the head level."
};

/**
 * How the face is held and lit — the rejections a perfectly framed photo still collects.
 *
 * Tolerances follow ICAO 9303's portrait guidance (roll within ±8°, yaw within about ±5°),
 * widened by the estimates' own error and held a little tighter for a pass.
 * Expression is a warning rather than a failure: some authorities accept a natural smile.
 */
export function poseChecks(
  pose: FacePose | null,
  rotation = 0,
  fixes: PoseFixes = MAKER_POSE_FIXES
): Check[] {
  if (!pose) {
    return [{
      id: "pose",
      label: "Head straight",
      status: "unknown",
      value: "Not measured",
      advice: "No face could be measured. Check by eye that the head is level and facing the camera."
    }];
  }

  const checks: Check[] = [];

  if (pose.faces > 1) {
    checks.push({
      id: "faces",
      label: "One person",
      status: "fail",
      value: `${pose.faces} faces in the photo`,
      requirement: "only the applicant",
      advice: "Retake it with nobody else in the frame."
    });
  }

  // Roll, after any rotation applied on the crop step.
  const roll = pose.roll + rotation;
  const tilt = Math.abs(roll);
  checks.push({
    id: "tilt",
    label: "Head straight",
    status: tilt <= 3 ? "pass" : tilt <= 8 ? "warn" : "fail",
    value: tilt < 0.5 ? "Level" : `Tilted ${tilt.toFixed(1)}° towards the ${roll > 0 ? "left" : "right"} shoulder`,
    requirement: "eyes level, head not tilted",
    advice: tilt <= 3 ? undefined : `The head leans to one side. ${fixes.tilt}`
  });

  // Yaw is judged; pitch only flags the extreme. The pose estimate reads 10–18° of pitch on
  // straight-on studio portraits (its face model and the camera's perspective both add to
  // it), so a tighter limit would warn on nearly every good photo.
  const turned = pose.yaw;
  const nodding = pose.pitch > 25;
  checks.push({
    id: "facing",
    label: "Facing the camera",
    status: turned > 14 ? "fail" : turned > 7 || nodding ? "warn" : "pass",
    value: turned > 7
      ? `Turned about ${Math.round(turned)}°`
      : nodding
        ? "Chin raised or lowered"
        : "Straight on",
    requirement: "looking straight at the camera",
    advice: turned > 7
      ? "The head is turned to one side. Retake it facing the camera squarely, with both ears equally visible."
      : nodding
        ? "The chin looks raised or lowered. Retake it with the camera at eye level and the chin level."
        : undefined
  });

  checks.push({
    id: "eyes",
    label: "Eyes open",
    status: pose.eyesClosed > 0.7 ? "fail" : pose.eyesClosed > 0.5 ? "warn" : "pass",
    value: pose.eyesClosed > 0.7 ? "Closed" : pose.eyesClosed > 0.5 ? "Partly closed" : "Open",
    requirement: "both eyes open and visible",
    advice: pose.eyesClosed > 0.5 ? "Retake it with both eyes fully open, looking into the lens." : undefined
  });

  const mouthOpen = pose.mouthOpen > 0.25;
  // A closed-mouth half smile scores about 0.6; a clear smile goes well past this.
  const smiling = pose.smile > 0.7;
  checks.push({
    id: "expression",
    label: "Expression",
    status: mouthOpen || smiling ? "warn" : "pass",
    value: mouthOpen ? "Mouth open" : smiling ? "Smiling" : "Neutral",
    requirement: "neutral, mouth closed",
    advice: mouthOpen || smiling
      ? "Most authorities want a neutral expression with the mouth closed. A few accept a slight smile — check the document's rules."
      : undefined
  });

  const { left, right } = pose.cheeks;
  const brighter = Math.max(left, right);
  const evenness = brighter > 0 ? Math.min(left, right) / brighter : 1;
  const face = (left + right) / 2;
  const lightProblem =
    evenness < 0.7 ? "One side of the face is in shadow"
      : face < 60 ? "The face is too dark"
        : face > 235 ? "The face is overexposed"
          : null;
  checks.push({
    id: "lighting",
    label: "Lighting",
    status: lightProblem ? "warn" : "pass",
    value: lightProblem ?? "Even",
    requirement: "even, no shadows on the face",
    advice: lightProblem
      ? "Face a window or a soft light, with nothing bright behind or beside you."
      : undefined
  });

  return checks;
}

function backgroundCheck(bg: BackgroundSpec, preset?: Preset): Check {
  const accepted = backgroundsFor(preset);
  const names = accepted.map(b => b.label).join(" or ");

  if (bg.mode !== "REMOVED") {
    return {
      id: "background",
      label: "Background",
      status: "warn",
      value: "Original photo background",
      requirement: names,
      advice:
        "You kept the original background. That passes only if the wall behind you is " +
        "already plain and the right colour."
    };
  }

  const match = accepted.find(b => sameColor(b.color, bg.color));
  return {
    id: "background",
    label: "Background",
    status: match ? "pass" : "warn",
    value: match ? match.label : `Custom (${bg.color})`,
    requirement: names,
    advice: match ? undefined : `${preset ? presetTitle(preset) : "This document"} asks for ${names}.`
  };
}

/** A report from its checks: the verdict is the worst of them. */
export function summarise(checks: Check[], geometry?: Geometry): Report {
  return {
    checks,
    geometry,
    verdict: worst(checks),
    passed: checks.filter(c => c.status === "pass").length,
    total: checks.length
  };
}

export function buildReport(input: ComplianceInput): Report {
  const head = headChecks(input);
  const checks: Check[] = [
    sizeCheck(input.photo, input.preset),
    resolutionCheck(input.crop, input.outPx, input.photo.dpi, input.photo.unit),
    ...head.checks,
    // Left out while the face is still being measured, rather than shown as unknown and
    // then flipping: the report says "measuring…" meanwhile.
    ...(input.pose === undefined ? [] : poseChecks(input.pose, input.rotation)),
    backgroundCheck(input.bg, input.preset)
  ];

  return summarise(checks, head.geometry);
}
