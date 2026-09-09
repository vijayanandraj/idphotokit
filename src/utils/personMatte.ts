import { matteCanvas } from "./modnet";
import { segmentCanvas, type Mask } from "./mediapipe";

/**
 * One way to ask "which pixels are the person?".
 *
 * MODNet does the real work. The old selfie segmenter stays only as a safety net for a
 * browser that cannot run the ONNX runtime at all — it is materially worse (it deletes hair
 * ribbons and keeps lumps of a cluttered room), so it is never chosen while MODNet works.
 */

export type MatteSource = "modnet" | "fallback";

export type PersonMatte = {
  mask: Mask;
  source: MatteSource;
};

// Matting costs a couple of seconds, and the inputs that change most often — background
// colour, edge sliders — do not affect it at all. Keyed on what actually alters the pixels.
let cached: { key: string; value: PersonMatte } | null = null;

export function clearMatteCache() {
  cached = null;
}

export async function personMatte(src: HTMLCanvasElement, key: string): Promise<PersonMatte> {
  if (cached && cached.key === key) return cached.value;

  try {
    const value: PersonMatte = { mask: await matteCanvas(src), source: "modnet" };
    cached = { key, value };
    return value;
  } catch (err) {
    console.warn("Matting model unavailable, falling back to selfie segmentation:", err);
    // Deliberately not cached: a failure here is usually a slow or interrupted download, and
    // caching it would pin this crop to the worse cut-out for the rest of the session.
    return { mask: await segmentCanvas(src), source: "fallback" };
  }
}
