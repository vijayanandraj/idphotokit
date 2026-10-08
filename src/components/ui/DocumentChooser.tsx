import { useMemo, useState } from "react";
import {
  ANY_COUNTRY,
  documentsByCategory,
  documentsFor,
  formatSize,
  searchPresets,
  type Category,
  type Preset
} from "../../utils/presets";

type Props = {
  selected: Preset;
  onSelect: (p: Preset) => void;
};

/** Up to this many documents read fine as a row of pills; past it they need grouping. */
const PILL_LIMIT = 6;

/** The categories most people come for. The rest start folded so a long list stays scannable. */
const OPEN_BY_DEFAULT: Category[] = ["Passport", "Visa", "Residence & immigration", "ID card", "Driving licence", "Standard sizes"];

/**
 * A country's documents.
 *
 * India has 24 and the United States 45, so one row of pills stops working well before
 * that. Small countries keep the pills; larger ones get their documents grouped by
 * category (passport, visa, residence, ID card, licence…), with a filter once the list is
 * long enough to need one.
 */
export default function DocumentChooser({ selected, onSelect }: Props) {
  const all = documentsFor(selected.country);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Set<Category>>(() => new Set(OPEN_BY_DEFAULT));

  const groups = useMemo(() => {
    const groups = documentsByCategory(selected.country);
    if (!filter.trim()) return groups;
    const hits = new Set(searchPresets(`${filter}`).filter(p => p.country === selected.country).map(p => p.id));
    return groups
      .map(g => ({ ...g, documents: g.documents.filter(d => hits.has(d.id)) }))
      .filter(g => g.documents.length > 0);
  }, [selected.country, filter]);

  if (all.length <= 1) return null;

  const countryLabel = selected.country === ANY_COUNTRY ? "Standard sizes" : selected.name;

  if (all.length <= PILL_LIMIT) {
    return (
      <>
        <div className="docTabsLabel small">{countryLabel} documents</div>
        <div className="docTabs" role="radiogroup" aria-label={`${countryLabel} documents`}>
          {all.map(d => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={d.id === selected.id}
              className={`pill ${d.id === selected.id ? "active" : ""}`}
              onClick={() => onSelect(d)}
            >
              {d.doc}
              {d.variant && <span className="docTabVariant">{d.variant}</span>}
              <span className="mono docTabSize">{formatSize(d)}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  const filtering = filter.trim().length > 0;
  const toggle = (c: Category) =>
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  return (
    <div className="docChooser">
      <div className="docChooserHead">
        <div className="docTabsLabel small">
          {countryLabel} · {all.length} documents
        </div>
        <input
          className="input docFilter"
          type="search"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={`Filter ${countryLabel} documents`}
          aria-label={`Filter ${countryLabel} documents`}
        />
      </div>

      {groups.length === 0 && (
        <div className="small" style={{ padding: "10px 2px" }}>
          Nothing in {countryLabel} matches “{filter}”. Clear the filter, or search every country above.
        </div>
      )}

      <div className="docGroups">
        {groups.map(g => {
          // The group holding the selection is always open, so the choice is never hidden.
          const isOpen = filtering || open.has(g.category) || g.documents.some(d => d.id === selected.id);
          return (
            <section key={g.category} className={`docGroup ${isOpen ? "open" : ""}`}>
              <button
                type="button"
                className="docGroupHead"
                aria-expanded={isOpen}
                onClick={() => toggle(g.category)}
              >
                <span>{g.category}</span>
                <span className="docGroupCount mono">{g.documents.length}</span>
                <span className="docGroupChevron" aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
              </button>
              {isOpen && (
                <div className="docGroupRows" role="radiogroup" aria-label={g.category}>
                  {g.documents.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      role="radio"
                      aria-checked={d.id === selected.id}
                      className={`docRow ${d.id === selected.id ? "selected" : ""}`}
                      onClick={() => onSelect(d)}
                    >
                      <span className="docRowName">
                        {d.doc}
                        {d.variant && <span className="docRowVariant"> · {d.variant}</span>}
                      </span>
                      <span className="docRowSize mono">{formatSize(d)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
