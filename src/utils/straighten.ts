/**
 * Rotate a photo so the eye line is level.
 *
 * Nearly every authority wants the head straight, and a head tilted a few degrees towards a
 * shoulder is the most common pose fault in a phone photo — and the only one that can be
 * fixed after the fact. Rotating the whole photo (rather than the crop) means everything
 * after it — framing, matting, the checks — runs on a level image and needs no changes.
 *
 * The rotation keeps the photo's own size and turns about the point between the eyes, so the
 * face stays where it was. The corners this uncovers are filled with the colour of the photo's
 * edge, which is nearly always the wall behind the subject, and are replaced anyway when the
 * background is.
 */

/** Below this the tilt is within measurement noise and every authority's tolerance. */
export const STRAIGHTEN_MIN_DEG = 1;

/**
 * Past this the photo is more likely sideways or deliberately posed than a tilted head, and
 * rotating it would uncover too much of the corners to frame cleanly.
 */
export const STRAIGHTEN_MAX_DEG = 25;

export type Straightened = { bitmap: ImageBitmap; url: string; angle: number };

/** Mean colour of the outermost pixels, as a CSS colour. */
function edgeColour(ctx: CanvasRenderingContext2D, w: number, h: number): string {
  const strips = [
    ctx.getImageData(0, 0, w, 1),
    ctx.getImageData(0, h - 1, w, 1),
    ctx.getImageData(0, 0, 1, h),
    ctx.getImageData(w - 1, 0, 1, h)
  ];
  let r = 0, g = 0, b = 0, n = 0;
  for (const s of strips) {
    for (let i = 0; i < s.data.length; i += 4) {
      r += s.data[i];
      g += s.data[i + 1];
      b += s.data[i + 2];
      n++;
    }
  }
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

/**
 * Rotate `bitmap` by `-roll` degrees about `pivot`, so a head tilted by `roll` comes out level.
 * Returns the new bitmap and an object URL for displaying it; the caller owns the URL.
 */
export async function straighten(
  bitmap: ImageBitmap,
  roll: number,
  pivot: { x: number; y: number }
): Promise<Straightened> {
  const { width: w, height: h } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  ctx.drawImage(bitmap, 0, 0);
  const fill = edgeColour(ctx, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate((-roll * Math.PI) / 180);
  ctx.translate(-pivot.x, -pivot.y);
  ctx.drawImage(bitmap, 0, 0);

  // The bitmap is lossless and is what every later step renders from; the JPEG only feeds the
  // crop step's on-screen image, where encoding a PNG of a 12MP photo would take seconds.
  const [out, blob] = await Promise.all([
    createImageBitmap(canvas),
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92)
    )
  ]);
  return { bitmap: out, url: URL.createObjectURL(blob), angle: -roll };
}
