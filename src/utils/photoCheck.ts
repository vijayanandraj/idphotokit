import type { PhotoSpec } from "../types";
import { measureHead } from "./autoframe";
import { headChecks, poseChecks, summarise, type Check, type CheckStatus, type Report } from "./compliance";
import { formatBytes } from "./encode";
import { personMatte } from "./personMatte";
import { analysePose } from "./pose";
import { backgroundsFor, formatFileKB, formatSize, presetTitle, type Preset } from "./presets";
import { toInches } from "./units";

/**
 * Checks a photo that is already finished — from a studio, a booth, another app — against a
 * document's requirements, as it is: no cropping, no background replacement.
 *
 * The wizard's report checks its own output, so it can take the size, the file and the
 * background for granted. A finished photo can get any of them wrong, so here they are
 * measured: the pixel size and shape, the file's format and weight, and the background's
 * actual colour and evenness, sampled from the pixels around the person.
 *
 * Every fault found here is one the wizard fixes, so the advice points there.
 */

/** Where the advice sends a photo whose framing is off. */
const REFRAME = "“Fix this photo” re-crops it to this document's framing.";
const POSE_FIXES = { tilt: "“Fix this photo” levels it automatically, or retake it with the head level." };

/** Longest edge sampled for the background. */
const SAMPLE_MAX_EDGE = 640;

/** Matte alpha below which a pixel is safely background. */
const BACKGROUND_ALPHA = 0.03;

export type PhotoCheck = Report & {
  /**
   * The photo described as a PhotoSpec, for the measured preview: the document's own size
   * when the shape matches, so markings read in its units, else the raw pixel size.
   */
  measuredAs: PhotoSpec;
  /** Mean background colour, when there was enough background to sample. */
  backgroundColour?: string;
};

function sameShape(w: number, h: number, spec: { width: number; height: number }): boolean {
  return Math.abs((w / h) / (spec.width / spec.height) - 1) <= 0.02;
}

function dimensionCheck(w: number, h: number, spec: PhotoSpec, preset?: Preset): Check {
  const value = `${w} × ${h} px`;
  const name = preset ? presetTitle(preset) : "this size";
  const requirement = formatSize(spec);

  if (!sameShape(w, h, spec)) {
    return {
      id: "size",
      label: "Size and shape",
      status: "fail",
      value: `${value} — ${(w / h).toFixed(2)}:1`,
      requirement: `${requirement}, ${(spec.width / spec.height).toFixed(2)}:1`,
      advice: `The photo is the wrong shape for ${name}. “Fix this photo” crops it to the right one.`
    };
  }

  if (spec.unit === "px") {
    const exact = w === Math.round(spec.width) && h === Math.round(spec.height);
    const larger = w >= spec.width && h >= spec.height;
    return {
      id: "size",
      label: "Size and shape",
      status: exact ? "pass" : larger ? "warn" : "fail",
      value,
      requirement,
      advice: exact
        ? undefined
        : larger
          ? `Larger than the ${requirement} the form asks for. Some forms resize it; others reject it. “Fix this photo” exports it at exactly ${requirement}.`
          : `Smaller than the ${requirement} the form asks for, and enlarging it won't add detail. Start from a higher-resolution photo.`
    };
  }

  // A print: the shape is right, so the question is whether there are enough pixels.
  const dpi = h / toInches(spec.height, spec.unit);
  return {
    id: "size",
    label: "Size and shape",
    status: dpi >= 290 ? "pass" : dpi >= 200 ? "warn" : "fail",
    value: `${value} — ${Math.round(dpi)} DPI at ${requirement}`,
    requirement: `${requirement}, 300 DPI for print`,
    advice: dpi >= 290
      ? undefined
      : `Too few pixels to print sharply at ${requirement}. Use the original, full-size photo rather than a copy sent through a messaging app.`
  };
}

function fileCheck(file: File, preset: Preset): Check | null {
  const limit = preset.fileKB;
  if (!limit && !preset.digitalOnly) return null;

  const jpeg = file.type === "image/jpeg";
  const kb = file.size / 1024;
  const tooBig = !!limit && kb > limit.max;
  const tooSmall = !!limit?.min && kb < limit.min;

  const problems = [
    !jpeg && `it is ${file.type.replace("image/", "").toUpperCase() || "not a JPEG"}, not JPEG`,
    (tooBig || tooSmall) && `it is ${formatBytes(file.size)}, and the form takes ${formatFileKB(limit!)}`
  ].filter(Boolean);

  return {
    id: "file",
    label: "File",
    status: problems.length ? "fail" : "pass",
    value: `${jpeg ? "JPEG" : file.type || "Unknown type"}, ${formatBytes(file.size)}`,
    requirement: limit ? `JPEG, ${formatFileKB(limit)}` : "JPEG",
    advice: problems.length
      ? `The upload form will refuse it: ${problems.join(" and ")}. “Fix this photo” saves a JPEG that fits.`
      : undefined
  };
}

const hex = (c: { r: number; g: number; b: number }) =>
  "#" + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");

function rgbOf(color: string) {
  const h = color.replace("#", "");
  const full = h.length === 3 ? h.split("").map(ch => ch + ch).join("") : h;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
}

/** The background, sampled from every pixel the matte is sure is not the person. */
async function backgroundCheck(
  bitmap: ImageBitmap,
  key: string,
  preset?: Preset
): Promise<{ check: Check; colour?: string }> {
  const accepted = backgroundsFor(preset);
  const names = accepted.map(b => b.label).join(" or ");
  const fixHint = "“Fix this photo” replaces it with the right colour.";

  const scale = Math.min(1, SAMPLE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const unknown = (value: string) => ({
    check: { id: "background", label: "Background", status: "unknown" as CheckStatus, value, requirement: names }
  });

  let mask;
  try {
    ({ mask } = await personMatte(canvas, key));
  } catch {
    return unknown("Not measured");
  }

  const { width: W, height: H } = canvas;
  const px = ctx.getImageData(0, 0, W, H).data;
  let n = 0, r = 0, g = 0, b = 0, lum = 0, lum2 = 0;
  // Left and right halves separately: a shadow cast to one side is the usual unevenness.
  const half = [{ n: 0, lum: 0 }, { n: 0, lum: 0 }];

  for (let y = 0; y < H; y += 2) {
    const my = Math.min(mask.height - 1, Math.floor((y / H) * mask.height));
    for (let x = 0; x < W; x += 2) {
      const mx = Math.min(mask.width - 1, Math.floor((x / W) * mask.width));
      if (mask.data[my * mask.width + mx] >= BACKGROUND_ALPHA) continue;
      const i = (y * W + x) * 4;
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      r += px[i]; g += px[i + 1]; b += px[i + 2];
      lum += l; lum2 += l * l; n++;
      const side = half[x < W / 2 ? 0 : 1];
      side.n++; side.lum += l;
    }
  }

  // A head-and-shoulders crop leaves little background; a sliver can't be judged.
  if (n < (W * H) / 4 * 0.03) return unknown("Too little background to measure");

  const mean = { r: r / n, g: g / n, b: b / n };
  const sd = Math.sqrt(Math.max(0, lum2 / n - (lum / n) ** 2));
  const sides = half.every(s => s.n > 50) ? Math.abs(half[0].lum / half[0].n - half[1].lum / half[1].n) : 0;

  const nearest = accepted
    .map(opt => {
      const c = rgbOf(opt.color);
      return { opt, d: Math.hypot(c.r - mean.r, c.g - mean.g, c.b - mean.b) };
    })
    .sort((x, y) => x.d - y.d)[0];

  const busy = sd > 28;
  const uneven = !busy && (sd > 14 || sides > 20);
  const colourStatus: CheckStatus = nearest.d < 45 ? "pass" : nearest.d < 100 ? "warn" : "fail";
  const status: CheckStatus = busy ? "fail" : uneven ? (colourStatus === "fail" ? "fail" : "warn") : colourStatus;

  const colourText = nearest.d < 45
    ? nearest.opt.label
    : nearest.d < 100
      ? `close to ${nearest.opt.label.toLowerCase()}, but off (${hex(mean)})`
      : `${hex(mean)}, not ${names.toLowerCase()}`;

  const problem = busy
    ? "The background is busy or patterned."
    : uneven
      ? "The background is unevenly lit — a shadow or texture shows behind the head."
      : colourStatus === "warn"
        ? `The background is not quite ${names.toLowerCase()}; a greyish or tinted wall is a common rejection.`
        : colourStatus === "fail"
          ? `${preset ? presetTitle(preset) : "This document"} asks for ${names.toLowerCase()}.`
          : null;

  return {
    colour: hex(mean),
    check: {
      id: "background",
      label: "Background",
      status,
      value: `${busy ? "Busy" : uneven ? "Uneven" : "Plain"}, ${colourText}`,
      requirement: `plain ${names.toLowerCase()}`,
      advice: problem ? `${problem} ${fixHint}` : undefined
    }
  };
}

let runs = 0;

/**
 * Check a finished photo against `spec` (and its document, when it has one). `file` is the
 * file as chosen, for its format and size; `bitmap` is it decoded.
 */
export async function checkPhoto(
  file: File,
  bitmap: ImageBitmap,
  spec: PhotoSpec,
  preset?: Preset
): Promise<PhotoCheck> {
  // Its own matte cache key, so it never reads back the wizard's matte of another photo.
  const key = `checker:${++runs}`;
  const { width: w, height: h } = bitmap;

  const measuredAs: PhotoSpec = sameShape(w, h, spec)
    ? spec
    : { width: w, height: h, unit: "px", dpi: spec.dpi, presetId: spec.presetId };

  const [head, pose] = await Promise.all([
    measureHead(bitmap, key).catch(() => null),
    analysePose(bitmap).catch(() => null)
  ]);
  const background = await backgroundCheck(bitmap, key, preset);

  const framing = headChecks({
    head,
    crop: { x: 0, y: 0, width: w, height: h },
    photo: measuredAs,
    preset,
    rotation: 0,
    reframe: REFRAME
  });

  const file_ = preset ? fileCheck(file, preset) : null;
  const checks: Check[] = [
    dimensionCheck(w, h, spec, preset),
    ...(file_ ? [file_] : []),
    ...framing.checks,
    ...poseChecks(pose, 0, POSE_FIXES),
    background.check
  ];

  return { ...summarise(checks, framing.geometry), measuredAs, backgroundColour: background.colour };
}
