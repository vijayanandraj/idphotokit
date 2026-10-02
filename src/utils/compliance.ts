import type { BackgroundSpec, PhotoSpec } from "../types";
import type { HeadMetrics } from "./autoframe";
import { backgroundsFor, DEFAULT_HEAD, formatSize, type Preset } from "./presets";
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

export type Report = {
  checks: Check[];
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
  const value = `${formatSize(photo)} at ${photo.dpi} DPI`;
  if (!preset) {
    return {
      id: "size",
      label: "Print size",
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
    label: "Print size",
    status: matches ? "pass" : "warn",
    value,
    requirement: `${formatSize(preset)} for ${preset.name}`,
    advice: matches ? undefined : `You have changed the size away from the ${preset.name} preset.`
  };
}

/**
 * Catches the one defect that survives every other step: a crop smaller than the output,
 * which canvas will happily interpolate into a soft photo that a print counter rejects.
 */
function resolutionCheck(crop: Rect | undefined, outPx: { w: number; h: number }, dpi: number): Check {
  const value = `${outPx.w} × ${outPx.h} px`;

  if (dpi < 300) {
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

function headChecks(input: ComplianceInput): Check[] {
  const { head, crop, photo, preset, rotation } = input;

  const unavailable = (advice: string): Check[] => [
    { id: "head", label: "Head height", status: "unknown", value: "Not measured", advice },
    { id: "headroom", label: "Space above head", status: "unknown", value: "Not measured" },
    { id: "centring", label: "Head centring", status: "unknown", value: "Not measured" }
  ];

  if (!head || !crop) {
    return unavailable("No face was detected, so the framing could not be measured. Check it by eye.");
  }
  if (Math.abs(rotation) > 0.5) {
    return unavailable("The crop is rotated, which makes these measurements unreliable. Check them by eye.");
  }

  const range = preset?.head ?? DEFAULT_HEAD;
  const photoMm = heightMm(photo);

  // Head height, chin to crown, as a fraction of the frame.
  const fraction = (head.chinY - head.crownY) / crop.height;
  const headMm = fraction * photoMm;
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
    value: `${mm(headMm)} (${pct(fraction)} of the frame)`,
    requirement: `${mm(range.min * photoMm)}–${mm(range.max * photoMm)}${preset?.head ? "" : " (ICAO default)"}`,
    advice:
      headStatus === "pass"
        ? undefined
        : fraction > range.max
          ? "The head is too large in frame. Zoom out on step 2, or re-run Auto-frame."
          : "The head is too small in frame. Zoom in on step 2, or re-run Auto-frame."
  };

  // Space above the crown. Negative means the top of the head is outside the crop.
  const above = (head.crownY - crop.y) / crop.height;
  const headroom: Check = {
    id: "headroom",
    label: "Space above head",
    status: above < 0 ? "fail" : above < 0.02 ? "warn" : above > 0.25 ? "warn" : "pass",
    value: above < 0 ? "Top of the head is cut off" : `${mm(above * photoMm)} (${pct(above)})`,
    // Stated as the band actually enforced below. Authorities rarely publish a figure for
    // this, so the check only catches a crown that is clipped or a face sitting far too low.
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

  // Eye line, only when the detector gave us keypoints. Reported as a guide: the tolerated
  // band is wide and varies by country, so this flags an obviously wrong framing rather than
  // a borderline one.
  if (head.eyeY !== undefined) {
    const eyeFromTop = (head.eyeY - crop.y) / crop.height;
    const ok = eyeFromTop >= 0.25 && eyeFromTop <= 0.55;
    checks.push({
      id: "eyeline",
      label: "Eye line",
      status: ok ? "pass" : "warn",
      value: `${pct(eyeFromTop)} down from the top`,
      requirement: "upper half of the frame",
      advice: ok ? undefined : "The eyes sit outside the usual band. Re-run Auto-frame on step 2."
    });
  }

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
    advice: match ? undefined : `${preset?.name ?? "This document"} asks for ${names}.`
  };
}

export function buildReport(input: ComplianceInput): Report {
  const checks: Check[] = [
    sizeCheck(input.photo, input.preset),
    resolutionCheck(input.crop, input.outPx, input.photo.dpi),
    ...headChecks(input),
    backgroundCheck(input.bg, input.preset)
  ];

  return {
    checks,
    verdict: worst(checks),
    passed: checks.filter(c => c.status === "pass").length,
    total: checks.length
  };
}
