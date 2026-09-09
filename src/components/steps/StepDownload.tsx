import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../state/store";
import { sizeToPx } from "../../utils/units";
import { getCroppedCanvas } from "../../utils/cropper";
import { applyAdjustmentsToImageData } from "../../utils/image";
import { personMatte } from "../../utils/personMatte";
import { compositeWithMask } from "../../utils/background";
import { renderSheet } from "../../utils/sheet";
import CornerTicks from "../ui/CornerTicks";
import { GitHubStarCard } from "../ui/GitHubStar";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: "image/png" | "image/jpeg",
  quality = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), format, quality);
  });
}

export default function StepDownload() {
  const setStep = useAppStore(s => s.setStep);
  const imageBitmap = useAppStore(s => s.imageBitmap);
  const photo = useAppStore(s => s.photo);
  const crop = useAppStore(s => s.crop);
  const croppedAreaPixels = useAppStore(s => s.croppedAreaPixels);
  const adj = useAppStore(s => s.adj);
  const bg = useAppStore(s => s.bg);
  const sheet = useAppStore(s => s.sheet);
  const setSheet = useAppStore(s => s.setSheet);

  const [busy, setBusy] = useState<string | null>(null);
  const [maxCount, setMaxCount] = useState<number>(0);

  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const outPx = useMemo(() => sizeToPx(photo.width, photo.height, photo.unit, photo.dpi), [photo]);

  /** Must match the key used on the background step so the matte is computed once. */
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

  const buildFinalTile = async (): Promise<HTMLCanvasElement> => {
    if (!imageBitmap || !croppedAreaPixels) throw new Error("Missing image/crop");

    // 1) Crop & rotate to target size
    const cropped = await getCroppedCanvas(
      imageBitmap,
      croppedAreaPixels,
      crop.rotation,
      outPx.w,
      outPx.h
    );

    // 2) Apply adjustments
    const ctx = cropped.getContext("2d", { willReadFrequently: true })!;
    const img = ctx.getImageData(0, 0, cropped.width, cropped.height);
    applyAdjustmentsToImageData(img, adj);
    ctx.putImageData(img, 0, 0);

    // 3) Background removal (optional)
    if (bg.mode !== "REMOVED") return cropped;

    const { mask } = await personMatte(cropped, matteKey);
    const composited = compositeWithMask(
      cropped,
      mask.data,
      mask.width,
      mask.height,
      bg.color,
      bg.featherPx,
      bg.edgeTighten
    );

    return composited;
  };

  const renderPreview = async () => {
    if (!previewRef.current) return;
    setBusy("Rendering preview...");
    try {
      const tile = await buildFinalTile();
      const c = previewRef.current;
      const ctx = c.getContext("2d")!;
      c.width = tile.width;
      c.height = tile.height;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(tile, 0, 0);
    } finally {
      setBusy(null);
    }
  };

  const downloadSingle = async (fmt: "png" | "jpeg") => {
    setBusy("Building single image...");
    try {
      const tile = await buildFinalTile();
      const mime = fmt === "png" ? "image/png" : "image/jpeg";
      const blob = await canvasToBlob(tile, mime, 0.92);
      downloadBlob(blob, `passport_${outPx.w}x${outPx.h}_${photo.dpi}dpi.${fmt}`);
    } finally {
      setBusy(null);
    }
  };

  const downloadSheet = async (fmt: "png" | "jpeg") => {
    setBusy("Building print sheet...");
    try {
      const tile = await buildFinalTile();
      const { sheetCanvas, maxCount: mc } = renderSheet(tile, sheet);
      setMaxCount(mc);

      const mime = fmt === "png" ? "image/png" : "image/jpeg";
      const blob = await canvasToBlob(sheetCanvas, mime, 0.92);
      downloadBlob(blob, `sheet_${sheet.paper}_${sheet.dpi}dpi.${fmt}`);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (imageBitmap && croppedAreaPixels) void renderPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageBitmap, croppedAreaPixels, bg, adj, crop]);

  if (!imageBitmap) {
    return <div className="small">Upload an image in Step 1 first.</div>;
  }

  return (
    <div className="row">
      <div className="col grow">
        <div className="card">
          <div className="sectionTitle">Single photo</div>

          <div className="row wrap">
            <button className="btn primary" onClick={() => void downloadSingle("png")} disabled={!!busy}>Download PNG</button>
            <button className="btn primary" onClick={() => void downloadSingle("jpeg")} disabled={!!busy}>Download JPEG</button>
          </div>

          <div className="toolRow" style={{ marginTop: 10 }}>
            <button className="btn good" onClick={() => void renderPreview()} disabled={!!busy}>Refresh preview</button>
          </div>

          <div className="small mono" style={{ marginTop: 8 }}>
            {outPx.w} × {outPx.h}px at {photo.dpi} DPI
          </div>
        </div>

        <div className="previewBox" style={{ marginTop: 12 }}>
          <CornerTicks />
          <canvas ref={previewRef} className="previewCanvas" />
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="sectionTitle">Print sheet</div>

          <div className="grid3">
            <div>
              <label>Paper</label>
              <select value={sheet.paper} onChange={(e) => setSheet({ paper: e.target.value as any })}>
                <option value="A4">A4</option>
                <option value="A3">A3</option>
                <option value="P4x6">4x6 inch</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>

            <div>
              <label>Sheet DPI</label>
              <input
                className="input"
                type="number"
                value={sheet.dpi}
                min={72}
                max={600}
                onChange={(e) => setSheet({ dpi: Number(e.target.value) })}
              />
            </div>

            <div>
              <label>Requested Count</label>
              <input
                className="input"
                type="number"
                value={sheet.requestedCount}
                min={1}
                onChange={(e) => setSheet({ requestedCount: Number(e.target.value) })}
              />
              <div className="small">Max fit (last render): {maxCount || "unknown"}</div>
            </div>

            {sheet.paper === "CUSTOM" && (
              <>
                <div>
                  <label>Custom Width</label>
                  <input
                    className="input"
                    type="number"
                    value={sheet.customWidth ?? 210}
                    onChange={(e) => setSheet({ customWidth: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label>Custom Height</label>
                  <input
                    className="input"
                    type="number"
                    value={sheet.customHeight ?? 297}
                    onChange={(e) => setSheet({ customHeight: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label>Unit</label>
                  <select value={sheet.customUnit ?? "mm"} onChange={(e) => setSheet({ customUnit: e.target.value as any })}>
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="in">inch</option>
                    <option value="px">px</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label>Margin (mm)</label>
              <input
                className="input"
                type="number"
                value={sheet.marginMm}
                min={0}
                max={20}
                onChange={(e) => setSheet({ marginMm: Number(e.target.value) })}
              />
            </div>

            <div>
              <label>Spacing (mm)</label>
              <input
                className="input"
                type="number"
                value={sheet.spacingMm}
                min={0}
                max={10}
                onChange={(e) => setSheet({ spacingMm: Number(e.target.value) })}
              />
            </div>

            <div>
              <label>
                <input
                  type="checkbox"
                  checked={sheet.cutLines}
                  onChange={(e) => setSheet({ cutLines: e.target.checked })}
                  style={{ marginRight: 8 }}
                />
                Cut lines
              </label>
            </div>
          </div>

          {/* changed: row -> row wrap */}
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={() => void downloadSheet("png")} disabled={!!busy}>Download Sheet PNG</button>
            <button className="btn primary" onClick={() => void downloadSheet("jpeg")} disabled={!!busy}>Download Sheet JPEG</button>
          </div>
        </div>

        <div className="row wrap" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => setStep(3)}>Back</button>
          <button className="btn danger" onClick={() => setStep(1)}>Start over</button>
        </div>

        {busy && <div className="small" style={{ marginTop: 8 }}>{busy}</div>}
      </div>

      <div className="col sidebar" style={{ width: 320 }}>
        <GitHubStarCard />

        <div className="card">
          <div className="sectionTitle">If something looks off</div>
          <div className="small">
            Blurry output:
            <br />– use a higher DPI (300 is usually fine)
            <br />– use a higher-resolution source photo
            <br /><br />
            Rough background edges:
            <br />– increase Soften edge
            <br />– increase Trim edge a little
          </div>
        </div>
      </div>
    </div>
  );
}
