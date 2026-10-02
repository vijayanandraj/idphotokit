import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../state/store";
import { measureHead, type HeadMetrics } from "../../utils/autoframe";
import { buildReport, type CheckStatus } from "../../utils/compliance";
import { findPreset } from "../../utils/presets";
import { sizeToPx } from "../../utils/units";

const GLYPH: Record<CheckStatus, string> = {
  pass: "✓",
  warn: "!",
  fail: "✕",
  unknown: "?"
};

const VERDICT_TEXT: Record<CheckStatus, string> = {
  pass: "Every measurement is in range",
  warn: "Worth a look before you print",
  fail: "Something needs fixing",
  unknown: "Partly checked"
};

export default function ComplianceReport() {
  const photo = useAppStore(s => s.photo);
  const crop = useAppStore(s => s.crop);
  const croppedAreaPixels = useAppStore(s => s.croppedAreaPixels);
  const bg = useAppStore(s => s.bg);
  const imageBitmap = useAppStore(s => s.imageBitmap);
  const imageUrl = useAppStore(s => s.imageUrl);
  const setStep = useAppStore(s => s.setStep);

  // measureHead caches its matte, so this is cheap on anything but the first call. The
  // result is stored with the photo it was measured from, so a new photo reads as "not
  // measured yet" without having to clear the old value first — which would mean writing
  // state synchronously inside the effect.
  const [measured, setMeasured] = useState<{ key?: string; metrics: HeadMetrics | null }>();

  useEffect(() => {
    if (!imageBitmap) return;
    let live = true;
    const key = imageUrl;
    measureHead(imageBitmap)
      .then(metrics => { if (live) setMeasured({ key, metrics }); })
      .catch(() => { if (live) setMeasured({ key, metrics: null }); });
    return () => { live = false; };
  }, [imageBitmap, imageUrl]);

  const fresh = !!measured && measured.key === imageUrl;
  const head = fresh ? measured.metrics : undefined;

  const preset = useMemo(() => findPreset(photo.presetId), [photo.presetId]);
  const outPx = useMemo(() => sizeToPx(photo.width, photo.height, photo.unit, photo.dpi), [photo]);

  const report = useMemo(
    () =>
      buildReport({
        photo,
        preset,
        bg,
        crop: croppedAreaPixels,
        rotation: crop.rotation,
        head,
        outPx
      }),
    [photo, preset, bg, croppedAreaPixels, crop.rotation, head, outPx]
  );

  const measuring = !!imageBitmap && !fresh;

  return (
    <details className={`panel check-${report.verdict}`} open>
      <summary className="panelHead">
        <span className={`checkMark ${report.verdict}`} aria-hidden="true">
          {GLYPH[report.verdict]}
        </span>
        <span className="panelTitle">
          {preset ? `${preset.name} requirements` : "Requirements"}
        </span>
        <span className="panelMeta mono">
          {measuring ? "measuring…" : `${report.passed}/${report.total} checks pass`}
        </span>
      </summary>

      <div className="panelBody">
        <div className={`verdict ${report.verdict}`}>{VERDICT_TEXT[report.verdict]}</div>

        <ul className="checkList">
          {report.checks.map(c => (
            <li key={c.id} className={`checkRow ${c.status}`}>
              <span className={`checkMark ${c.status}`} aria-hidden="true">{GLYPH[c.status]}</span>
              <span className="checkLabel">{c.label}</span>
              <span className="checkValue mono">{c.value}</span>
              {c.requirement && <span className="checkReq">needs {c.requirement}</span>}
              {c.status !== "pass" && c.advice && <span className="checkAdvice">{c.advice}</span>}
            </li>
          ))}
        </ul>

        {report.verdict !== "pass" && (
          <div className="row wrap" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setStep(2)}>Back to crop</button>
            <button className="btn" onClick={() => setStep(3)}>Back to background</button>
          </div>
        )}

        <div className="small" style={{ marginTop: 12 }}>
          These are the parts that can be measured. Expression, glasses, shadows and lighting
          are judged by a person — see the tips on step 1. Requirements change, and the
          authority's own guidance is always the authority.
        </div>
      </div>
    </details>
  );
}
