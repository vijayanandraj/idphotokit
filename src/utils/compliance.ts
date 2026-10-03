import type { BackgroundSpec, PhotoSpec } from "../types";
import type { HeadMetrics } from "./autoframe";
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
  /** Output size in pixels. */
  outPx: { w: number; h: number };
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

function headChecks(input: ComplianceInput): { checks: Check[]; geometry?: Geometry } {
  const { head, crop, photo, preset, rotation } = input;

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
    requirement: `${length(range.min, photo)}–${length(range.max, photo)}${preset?.head ? "" : " (ICAO default)"}`,
    advice:
      headStatus === "pass"
        ? undefined
        : fraction > range.max
          ? "The head is too large in frame. Zoom out on step 2, or re-run Auto-frame."
          : "The head is too small in frame. Zoom in on step 2, or re-run Auto-frame."
  };

  // Space above the crown. Negative means the top of the head is outside the crop.
  const above = (head.crownY - crop.y) / crop.height;
  const headroom = preset?.crownGap !== undefined
    ? publishedHeadroom(above, preset.crownGap, photo)
    : genericHeadroom(above, photo);

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
    advice: Math.abs(offset) < 0.025 ? undefined : "Pan sideways on step 2, or re-run Auto-frame."
  };

  const checks = [headHeight, headroom, centring];
  const eyeFromTop = head.eyeY === undefined ? undefined : (head.eyeY - crop.y) / crop.height;

  // Eye line, only when the detector gave us keypoints.
  if (eyeFromTop !== undefined) checks.push(eyeCheck(eyeFromTop, photo, preset));

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
function publishedHeadroom(above: number, target: number, photo: PhotoSpec): Check {
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
          ? "The crown is outside the crop. Re-run Auto-frame on step 2, or pan down."
          : off > 0
            ? "Too much space above the head. Re-run Auto-frame on step 2, or pan up."
            : "Too little space above the head. Re-run Auto-frame on step 2, or pan down."
  };
}

/**
 * Where a document publishes no figure, only catch a crown that is clipped or a face sitting
 * far too low. Authorities rarely publish one, so this is the usual case.
 */
function genericHeadroom(above: number, photo: PhotoSpec): Check {
  return {
    id: "headroom",
    label: "Space above head",
    status: above < 0 ? "fail" : above < 0.02 ? "warn" : above > 0.25 ? "warn" : "pass",
    value: above < 0 ? "Top of the head is cut off" : `${length(above, photo)} (${pct(above)})`,
    requirement: "a visible gap, up to a quarter of the frame",
    advice:
      above < 0
        ? "The crown is outside the crop. Re-run Auto-frame on step 2, or pan down."
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
function eyeCheck(eyeFromTop: number, photo: PhotoSpec, preset?: Preset): Check {
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
    advice: ok ? undefined : "The eyes sit outside the band. Re-run Auto-frame on step 2, or pan."
  };
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

export function buildReport(input: ComplianceInput): Report {
  const head = headChecks(input);
  const checks: Check[] = [
    sizeCheck(input.photo, input.preset),
    resolutionCheck(input.crop, input.outPx, input.photo.dpi, input.photo.unit),
    ...head.checks,
    backgroundCheck(input.bg, input.preset)
  ];

  return {
    checks,
    geometry: head.geometry,
    verdict: worst(checks),
    passed: checks.filter(c => c.status === "pass").length,
    total: checks.length
  };
}
