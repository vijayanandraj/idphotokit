import { useMemo, useState } from "react";
import {
  PRESETS,
  PRIMARY_PRESETS,
  REGIONS,
  documentsFor,
  formatSize,
  presetCode,
  searchPresets,
  type Preset
} from "../../utils/presets";

type Props = {
  /** The selected document. Its country is what's highlighted in the list. */
  selected?: Preset;
  isCustom: boolean;
  onSelect: (preset: Preset) => void;
  onCustom: () => void;
};

/**
 * A country row. Countries are listed once each, by their primary document; the other
 * documents are chosen on the spec card below, so the list stays a list of countries.
 */
function CountryRow({
  preset,
  selected,
  onSelect
}: {
  preset: Preset;
  selected: boolean;
  onSelect: (p: Preset) => void;
}) {
  const more = documentsFor(preset.country).length - 1;
  return (
    <button
      type="button"
      className={`countryRow ${selected ? "selected" : ""}`}
      onClick={() => onSelect(preset)}
      aria-pressed={selected}
    >
      <span className="code mono">{presetCode(preset)}</span>
      <span className="countryName">{preset.name}</span>
      <span className="countrySize mono">{formatSize(preset)}</span>
      {more > 0 && <span className="countryHead mono">+{more} more</span>}
    </button>
  );
}

/** A search hit is a document, so it names the document as well as the country. */
function DocumentRow({
  preset,
  selected,
  onSelect
}: {
  preset: Preset;
  selected: boolean;
  onSelect: (p: Preset) => void;
}) {
  return (
    <button
      type="button"
      className={`countryRow ${selected ? "selected" : ""}`}
      onClick={() => onSelect(preset)}
      aria-pressed={selected}
    >
      <span className="code mono">{presetCode(preset)}</span>
      <span className="countryName">
        {preset.name} <span className="docName">· {preset.doc}</span>
      </span>
      <span className="countrySize mono">{formatSize(preset)}</span>
    </button>
  );
}

export default function CountryPicker({ selected, isCustom, onSelect, onCustom }: Props) {
  const [query, setQuery] = useState("");
  // The full list is folded away by default. Search and the common row cover most people,
  // and the open list pushed "Add your photo" more than a screen further down.
  const [browsing, setBrowsing] = useState(false);

  const results = useMemo(() => searchPresets(query), [query]);
  const searching = query.trim().length > 0;

  // The common countries, plus the selected one when it isn't among them, so the current
  // choice is always visible at a glance.
  const pills = useMemo(() => {
    const common = PRIMARY_PRESETS.filter(p => p.common);
    const current = PRIMARY_PRESETS.find(p => p.country === selected?.country);
    return current && !current.common ? [...common, current] : common;
  }, [selected?.country]);

  // Picking the country already chosen keeps whichever of its documents is selected.
  const selectCountry = (p: Preset) => {
    if (selected?.country !== p.country) onSelect(p);
    setBrowsing(false);
  };

  return (
    <div className="picker">
      <input
        className="input"
        type="search"
        value={query}
        placeholder={`Search ${PRESETS.length} documents — “india”, “pan card”, “dv lottery”`}
        onChange={e => setQuery(e.target.value)}
        aria-label="Search countries and documents"
      />

      {!searching && (
        <div className="commonRow">
          {pills.map(p => (
            <button
              key={p.id}
              type="button"
              className={`pill ${selected?.country === p.country ? "active" : ""}`}
              onClick={() => selectCountry(p)}
            >
              <span className="mono">{presetCode(p)}</span> {p.name}
            </button>
          ))}
          <button
            type="button"
            className="pill browseToggle"
            aria-expanded={browsing}
            onClick={() => setBrowsing(b => !b)}
          >
            {browsing ? "Hide the list" : `All ${PRIMARY_PRESETS.length} countries`}
            <span aria-hidden="true">{browsing ? " ▴" : " ▾"}</span>
          </button>
        </div>
      )}

      {(searching || browsing) && <div className="countryList">
        {searching ? (
          results.length > 0 ? (
            results.map(p => (
              <DocumentRow
                key={p.id}
                preset={p}
                selected={selected?.id === p.id}
                onSelect={picked => {
                  onSelect(picked);
                  setQuery("");
                }}
              />
            ))
          ) : (
            <div className="small" style={{ padding: "14px 4px" }}>
              No match for “{query}”. Any size can still be entered by hand below.
            </div>
          )
        ) : (
          REGIONS.map(region => {
            const inRegion = PRIMARY_PRESETS.filter(p => p.region === region);
            if (inRegion.length === 0) return null;
            return (
              <div key={region}>
                <div className="regionHeading">{region}</div>
                {inRegion.map(p => (
                  <CountryRow
                    key={p.id}
                    preset={p}
                    selected={selected?.country === p.country}
                    onSelect={selectCountry}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>}

      {(searching || browsing || isCustom) && (
        <button
          type="button"
          className={`countryRow customRow ${isCustom ? "selected" : ""}`}
          onClick={() => {
            onCustom();
            setBrowsing(false);
          }}
          aria-pressed={isCustom}
        >
          <span className="code mono">•••</span>
          <span className="countryName">Custom size</span>
          <span className="countrySize mono">set it yourself</span>
        </button>
      )}
    </div>
  );
}
