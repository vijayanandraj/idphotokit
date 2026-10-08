import Cropper, { getInitialCropFromCroppedAreaPixels } from "react-easy-crop";
import type { Area, MediaSize, Size } from "react-easy-crop";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore, type Tilt } from "../../state/store";
import Slider from "../ui/Slider";
import CornerTicks from "../ui/CornerTicks";
import { sizeToPx } from "../../utils/units";
import { autoEnhanceParamsFromCanvas, applyAdjustmentsToImageData, canvasFromBitmap } from "../../utils/image";
import { measureHead, computeFrame } from "../../utils/autoframe";
import { findPreset, headTargetFor } from "../../utils/presets";
import { STRAIGHTEN_MAX_DEG } from "../../utils/straighten";

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

/**
 * What happened to the head's tilt. Straightening is automatic, so it has to say so — and
 * stay undoable, for the rare photo where the eyes are level and the head is not.
 */
function TiltNotice({ tilt, straightened, onToggle }: {
  tilt?: Tilt;
  straightened: boolean;
  onToggle: (on: boolean) => void;
}) {
  if (tilt === undefined) return <div className="small tiltNote">Checking whether the head is level…</div>;
  if (tilt.roll === null) return null;

  const degrees = `${Math.abs(tilt.roll).toFixed(1)}°`;
  if (tilt.straight) {
    return (
      <label className="checkToggle tiltNote">
        <input type="checkbox" checked={straightened} onChange={e => onToggle(e.target.checked)} />
        Straighten head
        <span className="small">
          {" "}— {straightened ? `levelled; it was tilted ${degrees}` : `tilted ${degrees}, which most authorities reject`}
        </span>
      </label>
    );
  }
  if (Math.abs(tilt.roll) > STRAIGHTEN_MAX_DEG) {
    return (
      <div className="small tiltNote" style={{ color: "var(--redline)" }}>
        The head is tilted {degrees}, which is too far to straighten cleanly. Retake it with the head level.
      </div>
    );
  }
  return <div className="small tiltNote">Head is level.</div>;
}

export default function StepCrop() {
  const imageUrl = useAppStore(s => s.imageUrl);
  const imageBitmap = useAppStore(s => s.imageBitmap);
  const setStep = useAppStore(s => s.setStep);

  const photo = useAppStore(s => s.photo);
  const crop = useAppStore(s => s.crop);
  const setCrop = useAppStore(s => s.setCrop);
  const setCroppedAreaPixels = useAppStore(s => s.setCroppedAreaPixels);
  const adj = useAppStore(s => s.adj);
  const setAdj = useAppStore(s => s.setAdj);
  const autoFramedFor = useAppStore(s => s.autoFramedFor);
  const setAutoFramedFor = useAppStore(s => s.setAutoFramedFor);
  const tilt = useAppStore(s => s.tilt);
  const straightened = useAppStore(s => s.straightened);
  const setStraightened = useAppStore(s => s.setStraightened);

  const px = useMemo(() => sizeToPx(photo.width, photo.height, photo.unit, photo.dpi), [photo]);
  const aspect = useMemo(() => px.w / px.h, [px]);

  const preset = useMemo(() => findPreset(photo.presetId), [photo.presetId]);
  const headTarget = useMemo(() => headTargetFor(preset), [preset]);

  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // react-easy-crop reports these once it has laid the image out; both are needed to convert
  // a crop rectangle in image pixels back into the component's crop/zoom pair.
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null);
  const [cropSize, setCropSize] = useState<Size | null>(null);

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, [setCroppedAreaPixels]);

  const renderPreview = useCallback(() => {
    if (!imageBitmap || !previewRef.current) return;

    // Quick preview: draw full image and apply adjustments (no crop)
    const c = previewRef.current;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    c.width = 360;
    c.height = Math.round(360 / aspect);

    // fit image
    const scale = Math.min(c.width / imageBitmap.width, c.height / imageBitmap.height);
    const dw = Math.round(imageBitmap.width * scale);
    const dh = Math.round(imageBitmap.height * scale);
    const dx = Math.round((c.width - dw) / 2);
    const dy = Math.round((c.height - dh) / 2);

    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(imageBitmap, dx, dy, dw, dh);

    const img = ctx.getImageData(0, 0, c.width, c.height);
    applyAdjustmentsToImageData(img, adj);
    ctx.putImageData(img, 0, 0);
  }, [imageBitmap, aspect, adj]);

  // Render preview on mount and whenever sliders/image change
  useEffect(() => { renderPreview(); }, [renderPreview]);

  const doAutoEnhance = async () => {
    if (!imageBitmap) return;
    setBusy("Auto enhancing...");
    try {
      const src = canvasFromBitmap(imageBitmap);
      const params = autoEnhanceParamsFromCanvas(src);
      setAdj({ ...params });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Frame the head to passport proportions.
   *
   * The head is measured (crown from the segmentation mask, chin from the face box), turned
   * into a crop rectangle in image pixels, and handed to react-easy-crop's own inverse helper
   * so the result lands exactly where we computed it.
   */
  const applyAutoFrame = useCallback(async (silent = false) => {
    if (!imageBitmap || !mediaSize || !cropSize) return false;

    if (!silent) setBusy("Finding the head...");
    setNotice(null);
    try {
      const metrics = await measureHead(imageBitmap);
      if (!metrics) {
        if (!silent) setNotice("No face detected — try a clearer, front-facing photo, or crop by hand.");
        return false;
      }

      const frame = computeFrame(
        metrics,
        aspect,
        imageBitmap.width,
        imageBitmap.height,
        headTarget,
        { crownGap: preset?.crownGap, eyeLine: preset?.eyeLine }
      );
      const { crop: point, zoom } = getInitialCropFromCroppedAreaPixels(
        frame,
        mediaSize,
        crop.rotation,
        cropSize,
        MIN_ZOOM,
        MAX_ZOOM
      );

      setCrop({ cropX: point.x, cropY: point.y, zoom });
      return true;
    } catch {
      if (!silent) setNotice("Could not analyse this photo. Crop by hand instead.");
      return false;
    } finally {
      if (!silent) setBusy(null);
    }
  }, [imageBitmap, mediaSize, cropSize, aspect, headTarget, preset, crop.rotation, setCrop]);

  // Frame automatically the first time a photo reaches this step, and again whenever the
  // chosen country changes, since each country frames the head differently. Manual
  // adjustments within one country are never overridden.
  const frameKey = imageUrl ? `${imageUrl}|${photo.presetId ?? "custom"}|${px.w}x${px.h}` : undefined;
  useEffect(() => {
    if (!frameKey || !mediaSize || !cropSize) return;
    if (autoFramedFor === frameKey) return;

    setAutoFramedFor(frameKey);
    void applyAutoFrame(true);
  }, [frameKey, mediaSize, cropSize, autoFramedFor, setAutoFramedFor, applyAutoFrame]);

  if (!imageUrl) {
    return (
      <div className="small">
        Upload an image in Step 1 first.
      </div>
    );
  }

  return (
    <div className="row">
      <div className="col grow">
        <div className="cropArea">
          <CornerTicks />
          <Cropper
            image={imageUrl}
            crop={{ x: crop.cropX, y: crop.cropY }}
            zoom={crop.zoom}
            rotation={crop.rotation}
            aspect={aspect}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            onCropChange={(c) => setCrop({ cropX: c.x, cropY: c.y })}
            onZoomChange={(z) => setCrop({ zoom: z })}
            onRotationChange={(r) => setCrop({ rotation: r })}
            onCropComplete={onCropComplete}
            onMediaLoaded={setMediaSize}
            onCropSizeChange={setCropSize}
            showGrid={false}
            cropShape="rect"
          />
        </div>

        <div className="toolRow" style={{ marginTop: 10 }}>
          <button className="btn good" onClick={() => void applyAutoFrame()} disabled={!!busy}>Auto-frame head</button>
          <button className="btn good" onClick={doAutoEnhance} disabled={!!busy}>Auto enhance</button>
        </div>

        <div className="actionRow" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => setStep(1)}>Back</button>
          <button
            className="btn primary grow-action"
            onClick={() => {
              // If user never moved the crop, onCropComplete might not have fired yet.
              // So we nudge zoom slightly to force Cropper to compute pixels, then go next.
              setCrop({ zoom: crop.zoom + 0.0001 });
              setTimeout(() => setStep(3), 0);
            }}
          >
            Save &amp; next
          </button>
        </div>

        <TiltNotice tilt={tilt} straightened={straightened} onToggle={setStraightened} />

        {busy && <div className="small" style={{ marginTop: 8 }}>{busy}</div>}
        {notice && <div className="small" style={{ marginTop: 8, color: "var(--redline)" }}>{notice}</div>}
      </div>

      <div className="col rightPane" style={{ width: 340 }}>
        <div className="card">
          <div className="sectionTitle">Adjustments</div>
          <Slider label="Brightness" value={adj.brightness} min={-100} max={100} onChange={(v) => setAdj({ brightness: v, autoEnhanced: false })} />
          <Slider label="Contrast" value={adj.contrast} min={-100} max={100} onChange={(v) => setAdj({ contrast: v, autoEnhanced: false })} />
          <Slider label="Saturation" value={adj.saturation} min={-100} max={100} onChange={(v) => setAdj({ saturation: v, autoEnhanced: false })} />

          <div className="hr" />
          <div className="small mono">
            {px.w} × {px.h}px at {photo.dpi} DPI
          </div>
        </div>

        <div className="previewBox">
          <CornerTicks />
          <canvas ref={previewRef} className="previewCanvas" />
        </div>
      </div>
    </div>
  );
}
