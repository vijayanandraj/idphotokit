import { useMemo } from "react";
import { useAppStore } from "../../state/store";
import { backgroundLabel, backgroundsFor, findPreset, formatSize, headTargetFor, PRESETS } from "../../utils/presets";
import { sizeToPx } from "../../utils/units";
import FilePicker from "../ui/FilePicker";
import CountryPicker from "../ui/CountryPicker";
import PhotoTips from "../ui/PhotoTips";

export default function StepSize() {
  const photo = useAppStore(s => s.photo);
  const setPhoto = useAppStore(s => s.setPhoto);
  const setImageFile = useAppStore(s => s.setImageFile);
  const syncToUrl = useAppStore(s => s.syncToUrl);

  const px = useMemo(() => sizeToPx(photo.width, photo.height, photo.unit, photo.dpi), [photo]);
  const preset = useMemo(() => findPreset(photo.presetId), [photo.presetId]);
  const headPercent = Math.round(headTargetFor(preset) * 100);

  return (
    <div className="stack">
      <section className="hero">
        <h1 className="heroTitle">Passport photos that pass.</h1>
        <p className="heroSub">
          Crop, centre the head to your country's rules, drop the background out, and print a
          full sheet. {PRESETS.length} countries. No account, no upload, no watermark, no fee.
        </p>

        <FilePicker onPick={f => void setImageFile(f)} />
      </section>

      <PhotoTips />

      <section className="card">
        <div className="sectionTitle">Where is this photo for?</div>
        <div className="small" style={{ marginBottom: 12 }}>
          Each country sets its own print size and how much of the frame the head must fill —
          both are applied when the photo is framed.
        </div>

        <CountryPicker
          selectedId={photo.presetId}
          isCustom={!photo.presetId}
          onSelect={p => {
            setPhoto({ presetId: p.id });
            syncToUrl();
          }}
          onCustom={() => {
            setPhoto({ presetId: undefined });
            syncToUrl();
          }}
        />
      </section>

      <section className="card">
        <div className="specHead">
          <div>
            <div className="sectionTitle">{preset ? preset.name : "Custom size"}</div>
            <div className="small">
              {preset ? formatSize(preset) : formatSize(photo)} · prints at{" "}
              <span className="mono">
                {px.w} × {px.h}px
              </span>{" "}
              at {photo.dpi} DPI
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

        <div className="specNotes">
          {preset && (
            <div className="small bgLine">
              <b>Background:</b>
              <span className="swatchRow">
                {backgroundsFor(preset).map(b => (
                  <span key={b.color} className="swatch" style={{ background: b.color }} />
                ))}
              </span>
              {backgroundLabel(preset)} — applied automatically
            </div>
          )}
          {preset?.note && <div className="small">{preset.note}</div>}
          {preset && !preset.head && (
            <div className="small">
              This country doesn't publish a chin-to-crown measurement, so a standard ICAO
              proportion is used. Adjust the crop by hand if your form states one.
            </div>
          )}
        </div>

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
                  setPhoto({ unit: e.target.value as any, presetId: undefined });
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
    </div>
  );
}
