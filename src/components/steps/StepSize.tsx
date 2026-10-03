import { useMemo } from "react";
import type { Unit } from "../../types";
import { useAppStore } from "../../state/store";
import {
  backgroundLabel,
  backgroundsFor,
  documentsFor,
  DEFAULT_HEAD,
  findPreset,
  formatFileKB,
  formatSize,
  headTargetFor,
  presetTitle,
  type Preset
} from "../../utils/presets";
import { sizeToPx, toInches } from "../../utils/units";
import FilePicker from "../ui/FilePicker";
import PrivacyNotice from "../ui/PrivacyNotice";
import CountryPicker from "../ui/CountryPicker";
import PhotoTips from "../ui/PhotoTips";
import Hero from "../ui/Hero";

/** A fraction of the photo height as a number in the photo's own unit: mm for a print, px for an upload. */
function lengthOf(fraction: number, p: Preset): string {
  if (p.unit === "px") return String(Math.round(fraction * p.height));
  const mm = toInches(fraction * p.height, p.unit) * 25.4;
  return mm.toFixed(mm < 10 ? 1 : 0);
}

const unitOf = (p: Preset) => (p.unit === "px" ? "px" : "mm");
const pct = (f: number) => Math.round(f * 100);

/** "3 mm (7%)" */
function along(fraction: number, p: Preset): string {
  return `${lengthOf(fraction, p)} ${unitOf(p)} (${pct(fraction)}%)`;
}

/** "32–36 mm (71–80%)" */
function rangeAlong(r: { min: number; max: number }, p: Preset): string {
  return `${lengthOf(r.min, p)}–${lengthOf(r.max, p)} ${unitOf(p)} (${pct(r.min)}–${pct(r.max)}%)`;
}

/**
 * The selected document's requirements, field by field — the same fields a requirements
 * sheet lists, read out of the data that frames and checks the photo.
 */
function SpecTable({ preset, dpi }: { preset: Preset; dpi: number }) {
  const px = sizeToPx(preset.width, preset.height, preset.unit, dpi);
  const head = preset.head ?? DEFAULT_HEAD;

  return (
    <table className="specGrid">
      <tbody>
        <tr>
          <th scope="row">Size</th>
          <td className="mono">
            {formatSize(preset)}
            {preset.unit !== "px" && <span className="muted"> · {px.w} × {px.h} px at {dpi} DPI</span>}
          </td>
        </tr>
        <tr>
          <th scope="row">Head, chin to crown</th>
          <td className="mono">
            {rangeAlong(head, preset)}
            {!preset.head && <span className="muted"> · ICAO default, none published</span>}
          </td>
        </tr>
        {preset.crownGap !== undefined && (
          <tr>
            <th scope="row">Top of photo to hair</th>
            <td className="mono">about {along(preset.crownGap, preset)}</td>
          </tr>
        )}
        {preset.eyeLine && (
          <tr>
            <th scope="row">Eye line, from the bottom</th>
            <td className="mono">{rangeAlong(preset.eyeLine, preset)}</td>
          </tr>
        )}
        <tr>
          <th scope="row">Background</th>
          <td>
            <span className="bgLine">
              <span className="swatchRow">
                {backgroundsFor(preset).map(b => (
                  <span key={b.color} className="swatch" style={{ background: b.color }} />
                ))}
              </span>
              {backgroundLabel(preset)} <span className="muted">— applied automatically</span>
            </span>
          </td>
        </tr>
        {preset.fileKB && (
          <tr>
            <th scope="row">File size</th>
            <td className="mono">{formatFileKB(preset.fileKB)}, JPEG</td>
          </tr>
        )}
        <tr>
          <th scope="row">Use</th>
          <td>{preset.digitalOnly ? "Online upload only" : "Print, or upload where the form accepts it"}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function StepSize() {
  const photo = useAppStore(s => s.photo);
  const setPhoto = useAppStore(s => s.setPhoto);
  const setImageFile = useAppStore(s => s.setImageFile);
  const syncToUrl = useAppStore(s => s.syncToUrl);

  const px = useMemo(() => sizeToPx(photo.width, photo.height, photo.unit, photo.dpi), [photo]);
  const preset = useMemo(() => findPreset(photo.presetId), [photo.presetId]);
  const documents = useMemo(() => (preset ? documentsFor(preset.country) : []), [preset]);
  const headPercent = Math.round(headTargetFor(preset) * 100);

  const choose = (p: Preset) => {
    setPhoto({ presetId: p.id });
    syncToUrl();
  };

  return (
    <div className="stack">
      <Hero preset={preset} />

      {/* The document comes first: it decides the size and the framing, and choosing a photo
          moves straight on to the crop step — so a picker below the upload was skipped by
          anyone who did the obvious thing first. */}
      <section className="card">
        <div className="sectionTitle">
          <span className="stepTag mono">1</span> What is the photo for?
        </div>
        <div className="small" style={{ marginBottom: 12 }}>
          Each document sets its own size and how much of the frame the head must fill — both
          are applied when the photo is framed.
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

        {documents.length > 1 && (
          <>
            <div className="docTabsLabel small">{preset?.name} documents</div>
            <div className="docTabs" role="radiogroup" aria-label={`${preset?.name} documents`}>
              {documents.map(d => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={d.id === preset?.id}
                  className={`pill ${d.id === preset?.id ? "active" : ""}`}
                  onClick={() => choose(d)}
                >
                  {d.doc}
                  <span className="mono docTabSize">{formatSize(d)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card uploadCard">
        <div className="sectionTitle">
          <span className="stepTag mono">2</span> Add your photo
        </div>
        <div className="small" style={{ marginBottom: 12 }}>
          It is framed to {preset ? presetTitle(preset) : "your custom size"} as soon as it opens.
        </div>

        <FilePicker
          onPick={f => void setImageFile(f)}
          forWhat={preset ? presetTitle(preset) : undefined}
        />

        <PrivacyNotice />
      </section>

      <section className="card">
        <div className="specHead">
          <div>
            <div className="sectionTitle">
              {preset ? `${presetTitle(preset)} requirements` : "Custom size"}
            </div>
            <div className="small">
              What the photo is framed to and checked against · {formatSize(preset ?? photo)}
              {photo.unit !== "px" && (
                <>
                  {" "}· prints at <span className="mono">{px.w} × {px.h}px</span> at {photo.dpi} DPI
                </>
              )}
            </div>
          </div>
          <div className="specHeadFigure">
            <span className="mono">
              {preset?.head ? "" : "~"}
              {headPercent}%
            </span>
            <span className="small">{preset?.head ? "head height" : "head height (typical)"}</span>
          </div>
        </div>

        {preset && <SpecTable preset={preset} dpi={photo.dpi} />}
        {preset?.note && <div className="small specNote">{preset.note}</div>}

        <details style={{ marginTop: 12 }}>
          <summary className="pill" style={{ display: "inline-block" }}>
            Adjust size, DPI or units
          </summary>

          <div className="grid2" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="dpi">DPI</label>
              <input
                id="dpi"
                className="input"
                type="number"
                value={photo.dpi}
                min={72}
                max={600}
                onChange={e => {
                  setPhoto({ dpi: Number(e.target.value) });
                  syncToUrl();
                }}
              />
            </div>

            <div>
              <label htmlFor="unit">Unit</label>
              <select
                id="unit"
                value={photo.unit}
                onChange={e => {
                  setPhoto({ unit: e.target.value as Unit, presetId: undefined });
                  syncToUrl();
                }}
              >
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="in">inch</option>
                <option value="px">px</option>
              </select>
            </div>

            <div>
              <label htmlFor="w">Width</label>
              <input
                id="w"
                className="input"
                type="number"
                value={photo.width}
                onChange={e => {
                  setPhoto({ width: Number(e.target.value), presetId: undefined });
                  syncToUrl();
                }}
              />
            </div>

            <div>
              <label htmlFor="h">Height</label>
              <input
                id="h"
                className="input"
                type="number"
                value={photo.height}
                onChange={e => {
                  setPhoto({ height: Number(e.target.value), presetId: undefined });
                  syncToUrl();
                }}
              />
            </div>
          </div>
        </details>

        <div className="small disclaimer">
          Sizes follow each authority's published guidance, but rules change — check the
          official requirements before you submit an application.
        </div>
      </section>

      <PhotoTips />
    </div>
  );
}
