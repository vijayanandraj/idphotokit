import type * as Ort from "onnxruntime-web";
import type { Mask } from "./mediapipe";

/**
 * Portrait matting with MODNet (Apache-2.0), run locally through ONNX Runtime Web.
 *
 * The selfie segmenter this replaces is a 256x256 classifier that answers "is this pixel
 * person-ish?" from colour and rough shape. That breaks in two ways that no amount of
 * post-processing fixes: a blue hair ribbon in front of a blue wall gets deleted, and a
 * cluttered room leaves lumps of wall behind. MODNet is trained for portrait *matting* — it
 * predicts alpha directly, understands people rather than colours, and runs at 512 on the
 * short edge, so it also resolves hair the older mask never could.
 *
 * The model is served from this site, not a third party: nothing about the photo, and no
 * request describing it, leaves the browser.
 */

/**
 * fp16 weights, ~13MB. Deliberately not the 6.6MB uint8 build: MODNet does not survive
 * uint8 quantisation — its output degenerates into noise. fp16 is indistinguishable from
 * fp32 here and half the size.
 */
const MODEL_URL = "/models/modnet.onnx";

/** The short edge the model was trained at. Both edges must be multiples of 32. */
const SHORT_EDGE = 512;
const DIVISOR = 32;

let sessionPromise: Promise<Ort.InferenceSession> | null = null;
let ortPromise: Promise<typeof Ort> | null = null;

/**
 * The runtime is imported on demand. It is by far the largest thing this app can load, and
 * most visits never reach the background step — so it must not sit in the initial bundle.
 */
function loadOrt(): Promise<typeof Ort> {
  if (!ortPromise) {
    ortPromise = import("onnxruntime-web").then(ort => {
      // Threads need SharedArrayBuffer, which needs COOP/COEP headers we do not set. Ask
      // for a single thread up front rather than relying on a fallback. The wasm itself is
      // served from this site, bundled by Vite — no third party is involved.
      ort.env.wasm.numThreads = 1;
      return ort;
    });
  }
  return ortPromise;
}

let loaded = false;

/** True once the model is in memory and matting will be immediate. */
export function isModnetLoaded(): boolean {
  return loaded;
}

export async function getModnetSession(): Promise<Ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = loadOrt()
      .then(ort =>
        ort.InferenceSession.create(MODEL_URL, {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all"
        })
      )
      .then(session => {
        loaded = true;
        return session;
      })
      .catch(err => {
        // Let a later attempt retry rather than caching the failure forever.
        sessionPromise = null;
        throw err;
      });
  }
  return sessionPromise;
}

/**
 * Start fetching the model without waiting for it.
 *
 * Called as soon as a photo is chosen, so the ~13MB download overlaps with the time the
 * person spends cropping instead of stalling them at the background step.
 */
export function prefetchModnet(): void {
  void getModnetSession().catch(() => {
    /* surfaced later, at the point of use */
  });
}

/** Round to a multiple of 32, never below one step. */
function toDivisible(value: number): number {
  return Math.max(DIVISOR, Math.round(value / DIVISOR) * DIVISOR);
}

/** Inference size: short edge at 512, aspect preserved, both edges multiples of 32. */
function inferenceSize(width: number, height: number): { w: number; h: number } {
  const scale = SHORT_EDGE / Math.min(width, height);
  return { w: toDivisible(width * scale), h: toDivisible(height * scale) };
}

/**
 * Run MODNet over a canvas and return a soft person alpha.
 * The mask comes back at inference resolution; callers sample it against their own grid.
 */
export async function matteCanvas(src: HTMLCanvasElement): Promise<Mask> {
  const session = await getModnetSession();
  const ort = await loadOrt();

  const { w, h } = inferenceSize(src.width, src.height);

  const scaled = document.createElement("canvas");
  scaled.width = w;
  scaled.height = h;
  const sctx = scaled.getContext("2d", { willReadFrequently: true })!;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(src, 0, 0, w, h);

  const { data } = sctx.getImageData(0, 0, w, h);

  // NCHW float32, scaled to [0,1] then normalised to [-1,1] (mean .5, std .5).
  const input = new Float32Array(3 * w * h);
  const plane = w * h;
  for (let i = 0; i < plane; i++) {
    const o = i * 4;
    input[i] = (data[o] / 255 - 0.5) / 0.5;
    input[plane + i] = (data[o + 1] / 255 - 0.5) / 0.5;
    input[2 * plane + i] = (data[o + 2] / 255 - 0.5) / 0.5;
  }

  const tensor = new ort.Tensor("float32", input, [1, 3, h, w]);
  const result = await session.run({ [session.inputNames[0]]: tensor });
  const out = result[session.outputNames[0]];

  const alpha = out.data as Float32Array;
  const [, , oh, ow] = out.dims as number[];

  // Copy: the tensor's buffer is owned by the runtime and reused between runs.
  const copy = new Float32Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i];
    copy[i] = a < 0 ? 0 : a > 1 ? 1 : a;
  }

  return { width: ow, height: oh, data: copy };
}
