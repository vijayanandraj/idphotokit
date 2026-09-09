// src/utils/background.ts

import { refineMatte } from "./matting";

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || "#ffffff").replace("#", "").trim();
  const v = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return [r, g, b];
}

function clamp01(a: number) {
  return a < 0 ? 0 : a > 1 ? 1 : a;
}


/**
 * Composite src over a solid background.
 *
 * The model's mask only seeds the process — the edge itself is re-derived from the image at
 * full resolution by `refineMatte`, which is what lets fine hair and fabric survive.
 *
 * maskAlpha: Float32Array 0..1 (1 = keep src/person, 0 = background)
 * featherPx: 0..3 extra softening of the finished edge, in output pixels
 * tighten:   0..1 pulls faint fringe out of the matte
 */
export function compositeWithMask(
  src: HTMLCanvasElement,
  maskAlpha: Float32Array,
  mw: number,
  mh: number,
  bgColor: string,
  featherPx: number,
  tighten: number,
  refineEdges = true
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;

  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  const octx = out.getContext("2d", { willReadFrequently: true })!;

  const srcImg = sctx.getImageData(0, 0, src.width, src.height);
  const dstImg = octx.createImageData(out.width, out.height);

  const [br, bg, bb] = hexToRgb(bgColor);
  const bgR = br / 255;
  const bgG = bg / 255;
  const bgB = bb / 255;

  const { alpha, fg } = refineMatte(srcImg, maskAlpha, Math.max(1, mw | 0), Math.max(1, mh | 0), {
    tighten: clamp01(tighten),
    featherPx,
    refineEdges
  });

  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i];
    const o = i * 4;
    dstImg.data[o] = Math.round((fg[i * 3] * a + bgR * (1 - a)) * 255);
    dstImg.data[o + 1] = Math.round((fg[i * 3 + 1] * a + bgG * (1 - a)) * 255);
    dstImg.data[o + 2] = Math.round((fg[i * 3 + 2] * a + bgB * (1 - a)) * 255);
    dstImg.data[o + 3] = 255;
  }

  octx.putImageData(dstImg, 0, 0);
  return out;
}
