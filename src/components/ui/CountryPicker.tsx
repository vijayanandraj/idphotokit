import { useEffect, useMemo, useRef, useState } from "react";
import {
  ANY_COUNTRY,
  COUNTRIES,
  browserCountry,
  PRESETS,
  PRIMARY_PRESETS,
  REGIONS,
  documentLabel,
  documentsFor,
  formatSize,
  presetCode,
  searchCountries,
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

/** Search results shown before "Show all": enough to scan, short enough to keep step 2 close. */
const FIRST_RESULTS = 12;

const COUNTRY_COUNT = COUNTRIES.filter(c => c.name !== ANY_COUNTRY).length;

/**
 * A country row. Countries are listed once each, by their main document; the other
 * documents are chosen below the picker, so the list stays a list of countries.
 */
function CountryRow({
  preset,
  selected,
  active,
  onSelect
}: {
  preset: Preset;
  selected: boolean;
  active?: boolean;
  onSelect: (p: Preset) => void;
}) {
  const count = documentsFor(preset.country).length;
  return (
    <button
      type="button"
      className={`countryRow ${selected ? "selected" : ""} ${active ? "active" : ""}`}
      onClick={() => onSelect(preset)}
      aria-pressed={selected}
      data-active={active || undefined}
    >
      <span className="code mono">{presetCode(preset)}</span>
      <span className="countryName">{preset.country === ANY_COUNTRY ? "Standard sizes" : preset.name}</span>
      <span className="countrySize mono">{formatSize(preset)}</span>
      <span className="countryHead mono">
        {count} document{count === 1 ? "" : "s"}
      </span>
    </button>
  );
}

/** A search hit is a document, so it names the document and its category as well as the country. */
function DocumentRow({
  preset,
  selected,
  active,
  onSelect
}: {
  preset: Preset;
  selected: boolean;
  active?: boolean;
  onSelect: (p: Preset) => void;
}) {
  return (
    <button
      type="button"
      className={`countryRow docResult ${selected ? "selected" : ""} ${active ? "active" : ""}`}
      onClick={() => onSelect(preset)}
      aria-pressed={selected}
      data-active={active || undefined}
    >
      <span className="code mono">{presetCode(preset)}</span>
      <span className="countryName">
        {preset.country === ANY_COUNTRY ? "Standard" : preset.name}{" "}
        <span className="docName">· {documentLabel(preset)}</span>
      </span>
      <span className="countrySize mono">{formatSize(preset)}</span>
      <span className="countryHead">{preset.category}</span>
    </button>
  );
}

export default function CountryPicker({ selected, isCustom, onSelect, onCustom }: Props) {
  const [query, setQueryState] = useState("");
  // The full list is folded away by default. Search and the shortcuts cover most people,
  // and the open list pushed "Add your photo" more than a screen further down.
  const [browsing, setBrowsing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  // A new query starts at its first, best result.
  const setQuery = (q: string) => {
    setQueryState(q);
    setActive(0);
    setShowAll(false);
  };

  const searching = query.trim().length > 0;
  const results = useMemo(() => (searching ? searchPresets(query) : []), [query, searching]);
  // Countries are offered as a whole only while the query still reads as a country name.
  const countryHits = useMemo(() => {
    if (!searching) return [];
    return searchCountries(query)
      .slice(0, 3)
      .map(c => documentsFor(c.name)[0])
      .filter(Boolean);
  }, [query, searching]);
  const shownDocs = showAll ? results : results.slice(0, FIRST_RESULTS);
  const rows = [...countryHits.map(p => ({ kind: "country" as const, p })), ...shownDocs.map(p => ({ kind: "doc" as const, p }))];

  // Keep the highlighted result in view while arrowing through the list.
  useEffect(() => {
    listRef.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // The featured countries, the visitor's own, and the selected one when it isn't among
  // them, so the current choice is always visible at a glance.
  const pills = useMemo(() => {
    const own =
      typeof navigator === "undefined" ? undefined : browserCountry(navigator.languages ?? [navigator.language])?.name;
    const names = [
      ...PRIMARY_PRESETS.filter(p => p.common).map(p => p.country),
      ...(own ? [own] : []),
      ...(selected ? [selected.country] : [])
    ].filter(n => n !== ANY_COUNTRY);
    const unique = [...new Set(names)];
    return unique.map(n => documentsFor(n)[0]).filter(Boolean);
  }, [selected]);
  const standard = documentsFor(ANY_COUNTRY)[0];

  // Picking the country already chosen keeps whichever of its documents is selected.
  const selectCountry = (p: Preset) => {
    if (selected?.country !== p.country) onSelect(p);
    setBrowsing(false);
    setQuery("");
  };
  const selectDocument = (p: Preset) => {
    onSelect(p);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searching || rows.length === 0) {
      if (e.key === "Escape") setQuery("");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(a => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) (row.kind === "country" ? selectCountry : selectDocument)(row.p);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  };

  return (
    <div className="picker">
      <div className="searchBox">
        <svg className="searchIcon" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          className="input searchInput"
          type="search"
          value={query}
          placeholder={`Search ${PRESETS.length} documents in ${COUNTRY_COUNT} countries`}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search countries and documents"
          aria-controls="picker-results"
          aria-expanded={searching}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {!searching && (
        <div className="searchHints small">
          Try <button type="button" className="linkish" onClick={() => setQuery("schengen visa")}>schengen visa</button>,{" "}
          <button type="button" className="linkish" onClick={() => setQuery("pan card")}>pan card</button>,{" "}
          <button type="button" className="linkish" onClick={() => setQuery("green card")}>green card</button> or a size like{" "}
          <button type="button" className="linkish" onClick={() => setQuery("3x4")}>3x4</button>
        </div>
      )}

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
          {standard && (
            <button
              type="button"
              className={`pill ${selected?.country === ANY_COUNTRY ? "active" : ""}`}
              onClick={() => selectCountry(standard)}
              title="3×4 cm, 2×2 inch, 35×45 mm and other sizes not tied to one country"
            >
              <span className="mono">STD</span> Standard sizes
            </button>
          )}
          <button
            type="button"
            className="pill browseToggle"
            aria-expanded={browsing}
            onClick={() => setBrowsing(b => !b)}
          >
            {browsing ? "Hide the list" : `All ${COUNTRY_COUNT} countries`}
            <span aria-hidden="true">{browsing ? " ▴" : " ▾"}</span>
          </button>
        </div>
      )}

      {searching && (
        <div className="countryList" id="picker-results" ref={listRef} role="listbox">
          {rows.length === 0 && (
            <div className="small" style={{ padding: "14px 10px" }}>
              No match for “{query}”. Try the country, the document or the size — or set any
              size yourself with Custom size below.
            </div>
          )}
          {countryHits.length > 0 && <div className="regionHeading">Countries</div>}
          {countryHits.map((p, i) => (
            <CountryRow
              key={`c-${p.id}`}
              preset={p}
              selected={selected?.country === p.country}
              active={active === i}
              onSelect={selectCountry}
            />
          ))}
          {results.length > 0 && (
            <div className="regionHeading">
              {results.length} document{results.length === 1 ? "" : "s"}
            </div>
          )}
          {shownDocs.map((p, i) => (
            <DocumentRow
              key={p.id}
              preset={p}
              selected={selected?.id === p.id}
              active={active === countryHits.length + i}
              onSelect={selectDocument}
            />
          ))}
          {!showAll && results.length > FIRST_RESULTS && (
            <button type="button" className="showMore" onClick={() => setShowAll(true)}>
              Show all {results.length} results
            </button>
          )}
        </div>
      )}

      {!searching && browsing && (
        <div className="countryList">
          {REGIONS.map(region => {
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
          })}
        </div>
      )}

      {(searching || browsing || isCustom) && (
        <button
          type="button"
          className={`countryRow customRow ${isCustom ? "selected" : ""}`}
          onClick={() => {
            onCustom();
            setBrowsing(false);
            setQuery("");
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
