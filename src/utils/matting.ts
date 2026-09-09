// src/utils/matting.ts
//
// Finishing pass over an alpha matte.
//
// This used to do much more: the old segmentation mask was a 256x256 blob, so the edge was
// re-derived from image colours — sampling local foreground and background, solving the
// compositing equation, and treating "unlike the backdrop colour" as foreground.
//
// That reasoning cannot survive contact with real photos. A blue hair ribbon in front of a
// blue wall is *exactly* the backdrop colour, so it was deleted. A cluttered room has no
// single backdrop colour, so lumps of wall were kept. Colour alone cannot tell those apart —
// only a model that understands people can, and MODNet now does that upstream.
//
// So this module no longer decides what is foreground. It only:
//   - resamples the matte onto the output grid
//   - optionally sharpens the edge along real image edges (guided filter)
//   - unmixes the old background colour out of semi-transparent pixels
//
// Every step is confined to pixels the matte already calls partial. None of them can add or
// remove a region.

export type MatteOptions = {
  /** 0..1 — pulls faint fringe out of the matte. 0 keeps everything the model found. */
  tighten: number;
  /** Extra blur on the finished alpha, in output pixels. */
  featherPx: number;
  /** Sharpen the edge against image detail. */
  refineEdges?: boolean;
};

export type Matte = {
  /** Alpha on the output grid, one float per pixel. */
  alpha: Float32Array;
  /** Foreground colour with the old background unmixed out, RGB interleaved. */
  fg: Float32Array;
};

function clamp01(a: number) {
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

/**
 * Mean over a (2r+1)² window, normalised by the actual window area so edges don't darken.
 * Uses an integral image, so cost is independent of the radius.
 */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const out = new Float32Array(w * h);
  if (r <= 0) {
    out.set(src);
    return out;
  }

  const stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));

  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const rowIn = y * w;
    const rowAbove = y * stride;
    const rowCur = (y + 1) * stride;
    for (let x = 0; x < w; x++) {
      rowSum += src[rowIn + x];
      integral[rowCur + x + 1] = integral[rowAbove + x + 1] + rowSum;
    }
  }

  for (let y = 0; y < h; y++) {
    const y0 = y - r > 0 ? y - r : 0;
    const y1 = y + r < h - 1 ? y + r : h - 1;
    const top = y0 * stride;
    const bottom = (y1 + 1) * stride;
    const rowOut = y * w;

    for (let x = 0; x < w; x++) {
      const x0 = x - r > 0 ? x - r : 0;
      const x1 = x + r < w - 1 ? x + r : w - 1;
      const sum =
        integral[bottom + x1 + 1] - integral[bottom + x0] - integral[top + x1 + 1] + integral[top + x0];
      out[rowOut + x] = sum / ((y1 - y0 + 1) * (x1 - x0 + 1));
    }
  }

  return out;
}

function sampleBilinear(alpha: Float32Array, w: number, h: number, fx: number, fy: number): number {
  if (fx < 0) fx = 0;
  if (fy < 0) fy = 0;
  if (fx > w - 1) fx = w - 1;
  if (fy > h - 1) fy = h - 1;

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const a0 = alpha[y0 * w + x0] * (1 - tx) + alpha[y0 * w + x1] * tx;
  const a1 = alpha[y1 * w + x0] * (1 - tx) + alpha[y1 * w + x1] * tx;
  return a0 * (1 - ty) + a1 * ty;
}

function resample(
  mask: Float32Array,
  mw: number,
  mh: number,
  w: number,
  h: number
): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = ((y + 0.5) / h) * mh - 0.5;
    for (let x = 0; x < w; x++) {
      const fx = ((x + 0.5) / w) * mw - 0.5;
      out[y * w + x] = clamp01(sampleBilinear(mask, mw, mh, fx, fy));
    }
  }
  return out;
}

/**
 * Edge-aware smoothing of `p`, guided by luminance `guide` (He et al.).
 * Pulls the matte onto real image edges without moving it across them.
 */
function guidedFilter(
  guide: Float32Array,
  p: Float32Array,
  w: number,
  h: number,
  r: number,
  eps: number
): Float32Array {
  const n = w * h;

  const meanI = boxBlur(guide, w, h, r);
  const meanP = boxBlur(p, w, h, r);

  const ip = new Float32Array(n);
  const ii = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ip[i] = guide[i] * p[i];
    ii[i] = guide[i] * guide[i];
  }

  const meanIP = boxBlur(ip, w, h, r);
  const meanII = boxBlur(ii, w, h, r);

  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = meanII[i] - meanI[i] * meanI[i];
    const covIP = meanIP[i] - meanI[i] * meanP[i];
    const ai = covIP / (varI + eps);
    a[i] = ai;
    b[i] = meanP[i] - ai * meanI[i];
  }

  const meanA = boxBlur(a, w, h, r);
  const meanB = boxBlur(b, w, h, r);

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = meanA[i] * guide[i] + meanB[i];
  return out;
}

/**
 * Average colour of the pixels selected by `weight`, over progressively larger windows.
 * Only used to know what colour to unmix out of the edge.
 */
function localColor(
  rgb: Float32Array,
  weight: Float32Array,
  w: number,
  h: number,
  radii: number[]
): Float32Array {
  const n = w * h;
  const wr = new Float32Array(n);
  const wg = new Float32Array(n);
  const wb = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const k = weight[i];
    wr[i] = rgb[i * 3] * k;
    wg[i] = rgb[i * 3 + 1] * k;
    wb[i] = rgb[i * 3 + 2] * k;
  }

  const out = new Float32Array(n * 3);
  const filled = new Uint8Array(n);
  const MIN_COVERAGE = 0.02;

  let gr = 0;
  let gg = 0;
  let gb = 0;
  let gw = 0;
  for (let i = 0; i < n; i++) {
    gr += wr[i];
    gg += wg[i];
    gb += wb[i];
    gw += weight[i];
  }
  if (gw > 0) {
    gr /= gw;
    gg /= gw;
    gb /= gw;
  }

  for (const r of radii) {
    const cov = boxBlur(weight, w, h, r);
    const sr = boxBlur(wr, w, h, r);
    const sg = boxBlur(wg, w, h, r);
    const sb = boxBlur(wb, w, h, r);

    let remaining = false;
    for (let i = 0; i < n; i++) {
      if (filled[i]) continue;
      const c = cov[i];
      if (c >= MIN_COVERAGE) {
        out[i * 3] = sr[i] / c;
        out[i * 3 + 1] = sg[i] / c;
        out[i * 3 + 2] = sb[i] / c;
        filled[i] = 1;
      } else {
        remaining = true;
      }
    }
    if (!remaining) return out;
  }

  for (let i = 0; i < n; i++) {
    if (filled[i]) continue;
    out[i * 3] = gr;
    out[i * 3 + 1] = gg;
    out[i * 3 + 2] = gb;
  }

  return out;
}

/**
 * Finish an alpha matte for compositing over `img`.
 * `mask` is expected to already be a correct person matte.
 */
export function refineMatte(
  img: ImageData,
  mask: Float32Array,
  mw: number,
  mh: number,
  opts: MatteOptions
): Matte {
  const w = img.width;
  const h = img.height;
  const n = w * h;

  const rgb = new Float32Array(n * 3);
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = img.data[i * 4] / 255;
    const g = img.data[i * 4 + 1] / 255;
    const b = img.data[i * 4 + 2] / 255;
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  let alpha = resample(mask, mw, mh, w, h);

  const unit = Math.max(1, Math.round(Math.min(w, h) / 100));

  if (opts.refineEdges !== false) {
    // Small radius and a loose epsilon: enough to snap the edge onto hair, not enough to
    // let image texture drag the matte around.
    const refined = guidedFilter(luma, alpha, w, h, Math.max(2, unit), 1e-4);
    for (let i = 0; i < n; i++) alpha[i] = clamp01(refined[i]);
  }

  if (opts.tighten > 0) {
    const cut = 0.35 * clamp01(opts.tighten);
    for (let i = 0; i < n; i++) alpha[i] = clamp01((alpha[i] - cut) / (1 - cut));
  }

  if (opts.featherPx > 0) {
    alpha = boxBlur(alpha, w, h, Math.round(opts.featherPx));
  }

  // Background colour, for unmixing only. Sampled from what the matte already calls empty.
  const bgSeed = new Float32Array(n);
  for (let i = 0; i < n; i++) bgSeed[i] = alpha[i] < 0.1 ? 1 : 0;
  const B = localColor(rgb, bgSeed, w, h, [unit * 4, unit * 12, unit * 32]);

  const fg = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    if (a >= 0.995) {
      fg[i * 3] = rgb[i * 3];
      fg[i * 3 + 1] = rgb[i * 3 + 1];
      fg[i * 3 + 2] = rgb[i * 3 + 2];
      continue;
    }

    const safe = Math.max(a, 0.15);
    const trust = clamp01((a - 0.05) / 0.45);
    for (let c = 0; c < 3; c++) {
      const unmixed = (rgb[i * 3 + c] - (1 - a) * B[i * 3 + c]) / safe;
      fg[i * 3 + c] = clamp01(unmixed * trust + rgb[i * 3 + c] * (1 - trust));
    }
  }

  return { alpha, fg };
}
