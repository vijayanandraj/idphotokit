import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../state/store";
import { checkPhoto, type PhotoCheck } from "../utils/photoCheck";
import { backgroundsFor, findPreset, formatSize, presetTitle, type Preset } from "../utils/presets";
import ComplianceReport from "./ui/ComplianceReport";
import CountryPicker from "./ui/CountryPicker";
import DocumentChooser from "./ui/DocumentChooser";
import FilePicker from "./ui/FilePicker";
import MeasuredPreview from "./ui/MeasuredPreview";
import PhotoTips from "./ui/PhotoTips";
import PrivacyNotice from "./ui/PrivacyNotice";

/** Longest edge drawn on screen. The checks run on the full photo; the preview needn't. */
const PREVIEW_MAX_EDGE = 900;

/**
 * Check a photo that is already finished — from a studio, a booth, another app — before
 * submitting it.
 *
 * The document is the same one the maker uses, so switching between the two keeps it. Every
 * fault the check finds is one the maker can fix, so the way out is one button that hands
 * the photo over.
 */
export default function PhotoChecker() {
  const photo = useAppStore(s => s.photo);
  const setPhoto = useAppStore(s => s.setPhoto);
  const syncToUrl = useAppStore(s => s.syncToUrl);
  const setImageFile = useAppStore(s => s.setImageFile);

  const preset = useMemo(() => findPreset(photo.presetId), [photo.presetId]);

  const [picked, setPicked] = useState<{ file: File; bitmap: ImageBitmap } | null>(null);
  const [result, setResult] = useState<{ key: string; check: PhotoCheck } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [showMarks, setShowMarks] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // What the current result has to match: the photo and the spec it was checked against.
  const key = picked ? `${picked.file.name}|${picked.file.size}|${picked.file.lastModified}|${photo.presetId}|${photo.width}x${photo.height}${photo.unit}` : "";
  const current = result?.key === key ? result.check : null;
  const failed = error?.key === key ? error.message : null;

  const choose = (p: Preset) => {
    setPhoto({ presetId: p.id });
    syncToUrl();
  };

  const pick = async (file?: File) => {
    if (!file) {
      setPicked(null);
      return;
    }
    try {
      setPicked({ file, bitmap: await createImageBitmap(file) });
    } catch {
      setPicked(null);
      setError({ key: "", message: "That file couldn't be opened as an image." });
    }
  };

  useEffect(() => {
    if (!picked) return;
    let live = true;
    checkPhoto(picked.file, picked.bitmap, photo, preset)
      .then(check => { if (live) setResult({ key, check }); })
      .catch(err => {
        console.warn("Photo check failed:", err);
        if (live) setError({ key, message: "The photo couldn't be analysed. Try a different file." });
      });
    return () => { live = false; };
  }, [picked, photo, preset, key]);

  // Draw the photo once its report (and so the preview's frame) exists.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !picked || !current) return;
    const { bitmap } = picked;
    const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }, [picked, current]);

  const fix = () => {
    if (picked) void setImageFile(picked.file);
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="sectionTitle">
          <span className="stepTag mono">1</span> What is the photo for?
        </div>
        <div className="small" style={{ marginBottom: 12 }}>
          The photo is checked against this document's size, framing and background.
        </div>
        <CountryPicker
          selected={preset}
          isCustom={!photo.presetId}
          onSelect={choose}
          onCustom={() => {
            setPhoto({ presetId: undefined });
            syncToUrl();
          }}
        />
        {preset && <DocumentChooser key={preset.country} selected={preset} onSelect={choose} />}
      </section>

      <section className="card uploadCard">
        <div className="sectionTitle">
          <span className="stepTag mono">2</span> Add the finished photo
        </div>
        <div className="small" style={{ marginBottom: 12 }}>
          The exact file you plan to submit, as it is. Nothing is cropped or changed.
        </div>
        <FilePicker
          onPick={f => void pick(f)}
          forWhat={preset ? presetTitle(preset) : undefined}
          prompt="Choose the photo to check, or drag it here"
        />
        <PrivacyNotice />
      </section>

      {failed && <div className="small" style={{ color: "var(--redline)" }}>{failed}</div>}
      {picked && !current && !failed && (
        <div className="small">Checking the photo against {preset ? presetTitle(preset) : formatSize(photo)}…</div>
      )}

      {picked && current && (
        <div className="row">
          <div className="col grow">
            <ComplianceReport
              report={current}
              preset={preset}
              measuring={false}
              actions={
                <>
                  <button className="btn primary" onClick={fix}>Fix this photo</button>
                  <span className="small">
                    Opens it in the maker: levelled, re-framed, background replaced and saved
                    at the right size.
                  </span>
                </>
              }
            />
            {current.verdict === "pass" && (
              <div className="small">
                Nothing measurable is wrong with it. Check the parts a person judges — glasses,
                glare, hair over the eyes — against the authority's own guidance before you submit.
              </div>
            )}
          </div>

          <div className="col rightPane" style={{ width: 380 }}>
            <div className="previewBox measuredBox">
              <MeasuredPreview
                canvasRef={canvasRef}
                photo={current.measuredAs}
                preset={preset}
                report={current}
                show={showMarks}
              />
            </div>
            <label className="checkToggle">
              <input type="checkbox" checked={showMarks} onChange={e => setShowMarks(e.target.checked)} />
              Show measurements
            </label>
          </div>
        </div>
      )}

      {/* Open once a photo has failed: the pictures show what to change when retaking it. */}
      <PhotoTips
        key={current?.verdict === "fail" ? "open" : "closed"}
        background={preset ? backgroundsFor(preset)[0]?.color : undefined}
        checking
        open={current?.verdict === "fail"}
      />
    </div>
  );
}
