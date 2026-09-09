import { useMemo, useRef, useState } from "react";
import { useEffect } from "react";
import { useAppStore } from "../../state/store";
import Slider from "../ui/Slider";
import { sizeToPx } from "../../utils/units";
import { getCroppedCanvas } from "../../utils/cropper";
import { applyAdjustmentsToImageData } from "../../utils/image";
import { personMatte } from "../../utils/personMatte";
import { isModnetLoaded } from "../../utils/modnet";
import { compositeWithMask } from "../../utils/background";
import CornerTicks from "../ui/CornerTicks";

type PreviewKind = "ORIGINAL" | "REMOVED";

export default function StepBackground() {
  const setStep = useAppStore(s => s.setStep);

  const imageBitmap = useAppStore(s => s.imageBitmap);
  const photo = useAppStore(s => s.photo);
  const crop = useAppStore(s => s.crop);
  const croppedAreaPixels = useAppStore(s => s.croppedAreaPixels);
  const adj = useAppStore(s => s.adj);

  const bg = useAppStore(s => s.bg);
  const setBg = useAppStore(s => s.setBg);

  const outPx = useMemo(() => sizeToPx(photo.width, photo.height, photo.unit, photo.dpi), [photo]);

  const origRef = useRef<HTMLCanvasElement | null>(null);
  const remRef = useRef<HTMLCanvasElement | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);

  const buildTileBase = async (): Promise<HTMLCanvasElement> => {
    if (!imageBitmap || !croppedAreaPixels) throw new Error("Missing image/crop");
    const cropped = await getCroppedCanvas(
      imageBitmap,
      croppedAreaPixels,
      crop.rotation,
      outPx.w,
      outPx.h
    );

    const ctx = cropped.getContext("2d", { willReadFrequently: true })!;
    const img = ctx.getImageData(0, 0, cropped.width, cropped.height);
    applyAdjustmentsToImageData(img, adj);
    ctx.putImageData(img, 0, 0);
    return cropped;
  };

  /** Identifies the pixels being matted, so the matte survives colour and slider changes. */
  const matteKey = useMemo(
    () =>
      JSON.stringify([
        croppedAreaPixels,
        crop.rotation,
        outPx.w,
        outPx.h,
        adj.brightness,
        adj.contrast,
        adj.saturation
      ]),
    [croppedAreaPixels, crop.rotation, outPx.w, outPx.h, adj]
  );

  const renderPreviews = async () => {
    if (!origRef.current || !remRef.current) return;

    // Only the first matte for a given crop is slow; after that the cache answers instantly,
    // so colour and slider changes should not announce a wait.
    const firstPass = !isModnetLoaded();
    setBusy(firstPass ? "Preparing the matting model (13 MB, first time only)…" : "Rendering previews…");

    try {
      const base = await buildTileBase();

      // ORIGINAL preview
      {
        const c = origRef.current;
        c.width = base.width;
        c.height = base.height;
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(base, 0, 0);
      }

      // REMOVED preview
      {
        const { mask, source } = await personMatte(base, matteKey);
        setDegraded(source === "fallback");

        const removed = compositeWithMask(
          base,
          mask.data,
          mask.width,
          mask.height,
          bg.color,
          bg.featherPx,
          bg.edgeTighten
        );

        const c = remRef.current;
        c.width = removed.width;
        c.height = removed.height;
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(removed, 0, 0);
      }
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (imageBitmap && croppedAreaPixels) {
      void renderPreviews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageBitmap, croppedAreaPixels, photo.width, photo.height, photo.dpi, photo.unit]);

  const selectMode = (mode: PreviewKind) => {
    setBg({ mode });
  };

  const onColorChange = async (hex: string) => {
    setBg({ color: hex });
    await renderPreviews();
  };

  const onFeatherChange = async (v: number) => {
    setBg({ featherPx: v });
    await renderPreviews();
  };

  const onEdgeTightenChange = async (v: number) => {
    setBg({ edgeTighten: v / 100 });
    await renderPreviews();
  };

  if (!imageBitmap) return <div className="small">Upload an image in Step 1 first.</div>;
  if (!croppedAreaPixels) return <div className="small">Finish cropping in Step 2 first.</div>;

  return (
    <div className="col">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="col grow">
          <div className="sectionTitle">Select a background style</div>

          <div className="row wrap" style={{ gap: 14 }}>
            {/* Original card */}
            <div
              className={`bgCard ${bg.mode === "ORIGINAL" ? "active" : ""}`}
              onClick={() => selectMode("ORIGINAL")}
            >
              <div className="bgCardTitleRow">
                <div className="bgCardTitle">Keep original</div>
                {bg.mode === "ORIGINAL" && <div className="bgSelectedTag">Selected</div>}
              </div>
              <div className="bgCardBody">
                <CornerTicks />
                <canvas ref={origRef} className="bgCanvas" />
              </div>
            </div>

            {/* Removed card */}
            <div
              className={`bgCard ${bg.mode === "REMOVED" ? "active" : ""}`}
              onClick={() => selectMode("REMOVED")}
            >
              <div className="bgCardTitleRow">
                <div className="bgCardTitle">Background removed</div>
                {bg.mode === "REMOVED" && <div className="bgSelectedTag">Selected</div>}
              </div>

              <div className="bgCardBody">
                <CornerTicks />
                <canvas ref={remRef} className="bgCanvas" />
              </div>

              <div className="bgCardFooter" onClick={(e) => e.stopPropagation()}>
                <label style={{ margin: 0 }}>Background color</label>
                <input
                  type="color"
                  value={bg.color}
                  onChange={(e) => void onColorChange(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="row wrap" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => void renderPreviews()} disabled={!!busy}>
              Refresh preview
            </button>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="grid2">
              <div>
                <Slider label="Soften edge" value={bg.featherPx} min={0} max={3} step={1} onChange={(v) => void onFeatherChange(v)} />
              </div>
              <div>
                <Slider label="Trim edge" value={Math.round(bg.edgeTighten * 100)} min={0} max={100} step={5} onChange={(v) => void onEdgeTightenChange(v)} />
              </div>
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              Raise Trim edge only if a rim of the old background still shows — it thins fine hair as it climbs.
              Off-white (#f8f8f8) often looks more natural than pure white.
            </div>
          </div>

          <div className="actionRow" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setStep(2)}>Back</button>
            <button className="btn primary grow-action" onClick={() => setStep(4)}>Save & next</button>
          </div>

          {busy && <div className="small" style={{ marginTop: 8 }}>{busy}</div>}
          {degraded && (
            <div className="small" style={{ marginTop: 8, color: "var(--redline)" }}>
              The matting model couldn't load, so a simpler cut-out is being used — hair and
              accessories may be rougher. Check your connection and reload to get the better one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
