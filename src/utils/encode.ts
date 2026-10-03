/**
 * JPEG encoding to a file-size limit.
 *
 * Upload forms reject on bytes, not on looks: a PAN card upload over 30KB or a DS-160 photo
 * over 240KB fails no matter how good it is. So for a document with a limit, the download is
 * the best quality that fits, found by bisecting the JPEG quality setting.
 */

export type Encoded = {
  blob: Blob;
  /** The JPEG quality used, 0..1. */
  quality: number;
  /** False when even the lowest quality tried is still outside the limit. */
  fits: boolean;
};

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", quality);
  });
}

/** Below this, JPEG artefacts on skin are visible enough to get a photo rejected anyway. */
const MIN_QUALITY = 0.3;
const MAX_QUALITY = 0.95;

export async function encodeJpegWithin(
  canvas: HTMLCanvasElement,
  limitKB: { min?: number; max: number }
): Promise<Encoded> {
  const maxBytes = limitKB.max * 1024;
  const minBytes = (limitKB.min ?? 0) * 1024;

  const best = await toJpeg(canvas, MAX_QUALITY);
  if (best.size <= maxBytes) {
    // Already under the ceiling. A floor is only a problem for tiny, flat images; the
    // highest quality is the most that can be done about it.
    if (best.size >= minBytes) return { blob: best, quality: MAX_QUALITY, fits: true };
    const top = await toJpeg(canvas, 1);
    return { blob: top, quality: 1, fits: top.size >= minBytes };
  }

  let lo = MIN_QUALITY;
  let hi = MAX_QUALITY;
  let found: Encoded | null = null;

  for (let i = 0; i < 7; i++) {
    const q = (lo + hi) / 2;
    const blob = await toJpeg(canvas, q);
    if (blob.size <= maxBytes) {
      found = { blob, quality: q, fits: blob.size >= minBytes };
      lo = q;
    } else {
      hi = q;
    }
  }

  if (found) return found;
  const floor = await toJpeg(canvas, MIN_QUALITY);
  return { blob: floor, quality: MIN_QUALITY, fits: floor.size <= maxBytes };
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
