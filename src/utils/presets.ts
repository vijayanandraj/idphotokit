import type { Unit } from "../types";
import SHEET, { countries as COUNTRY_SHEET } from "../../specs/documents.csv";

/**
 * Photo specifications by country and document.
 *
 * The data lives in two spreadsheets — specs/countries.csv and specs/documents.csv — so a new
 * document or a corrected figure is a row edited in Excel, not a code change. They are read
 * and checked at build time by scripts/specs.mjs; this file turns the rows into the presets
 * the app runs on and holds the helpers around them.
 *
 * A country is not one specification. India alone asks for a 35x45mm print for a passport, a
 * 51x51mm square for OCI, a 213px square for a PAN card upload and a 420x525px one for a
 * driving licence. So every preset here is a *document*, and documents are grouped by
 * country, and within a country by category: passport, visa, residence, ID card and so on.
 *
 * What varies between documents, and all of it matters:
 *
 *  - the size: a print size (35x45mm, 2x2in, 50x70mm...) or, for upload-only documents, a
 *    pixel size
 *  - how big the head has to be inside that frame, which is the part most tools ignore.
 *    Canada wants the face to fill under half the frame; Australia and Japan want three
 *    quarters. Cropping every document to the same proportions produces a photo that is the
 *    right size and still gets rejected.
 *  - where the head sits: the gap above the hair and the height of the eye line
 *  - for uploads, the file size the form will accept
 *
 * `head` is the chin-to-crown height as a fraction of the photo height. Most authorities
 * publish one figure ("34.5 mm"): that is `head.target`, and the photo is checked within a
 * small band around it. Where a range is published it is used as is. Where nothing is
 * published, `head` is left out and a neutral ICAO-style default is used instead.
 */

export type Region = "Africa" | "Americas" | "Asia & Pacific" | "Europe" | "Middle East" | "Worldwide";

export type Category =
  | "Passport"
  | "Visa"
  | "Residence & immigration"
  | "ID card"
  | "Driving licence"
  | "Licences & permits"
  | "Education & exams"
  | "Cards & passes"
  | "Standard sizes"
  | "Other";

/** In the order a country's documents are grouped. */
export const CATEGORIES: Category[] = [
  "Passport", "Visa", "Residence & immigration", "ID card", "Driving licence",
  "Licences & permits", "Education & exams", "Cards & passes", "Standard sizes", "Other"
];

/**
 * A background an authority accepts.
 *
 * Held as an actual colour rather than prose, so choosing a document can *set* the
 * background instead of merely describing it. Where more than one is accepted, the first is
 * applied and the rest are offered as one-click alternatives.
 */
export type BackgroundOption = { label: string; color: string };

const WHITE: BackgroundOption = { label: "White", color: "#ffffff" };

type Range = { min: number; max: number };
/** A range with, where one figure was published, that figure. */
export type Band = Range & { target?: number };

/** One row of countries.csv. */
export type Country = {
  name: string;
  /** ISO 3166-1 alpha-3, shown as the badge: "IND". "EU" and "ANY" for the two non-countries. */
  code: string;
  /** ISO 3166-1 alpha-2, matched against the browser's language region. Empty for non-countries. */
  iso2: string;
  region: Region;
  /** Shown as a shortcut at the top of the picker. */
  featured: boolean;
  /** Other names people search for: "UK", "Holland", "Schengen". */
  aliases: string[];
};

/** One row of documents.csv, as scripts/specs.mjs hands it over. */
export type SheetRow = {
  id: string;
  /** Country name, as a traveller would look for it. Rows are grouped by it. */
  country: string;
  /** What the document is: "Passport", "PAN card". */
  doc: string;
  /** What tells it from a same-named document: "online", "from the USA", "2×2 in". */
  variant?: string;
  category: Category;
  width: number;
  height: number;
  /** "px" for documents that are only ever uploaded, never printed. */
  unit: Unit;
  /** Chin-to-crown height as a fraction of photo height. */
  head?: Band;
  /** Space from the top of the photo to the top of the hair, as a fraction of photo height. */
  crownGap?: number;
  /** Eye line, measured up from the bottom edge, as a fraction of photo height. */
  eyeLine?: Band;
  /** Accepted backgrounds, most standard first. The first one is applied automatically. */
  backgrounds: BackgroundOption[];
  /** File size the upload form accepts, in kilobytes. Downloads are compressed to fit. */
  fileKB?: { min?: number; max: number };
  /** Upload only: there is no print sheet, and the pixel size is the requirement. */
  digitalOnly?: boolean;
  /** Anything else worth knowing before printing or uploading. */
  note?: string;
  /** The authority's own pages for this requirement. */
  sources?: string[];
};

export type Preset = SheetRow & {
  /** Country name — the same as `country`, named for the places that print it. */
  name: string;
  region: Region;
  /** The country's badge code. */
  code: string;
  /** True for the first row listed for its country: its main document. */
  primary: boolean;
  /** The country is featured in the picker. */
  common: boolean;
};

/** Used when a document publishes no chin-to-crown figure. Mid-range for ICAO photos. */
export const DEFAULT_HEAD: Band = { min: 0.6, max: 0.7 };

/** The pseudo-country that holds sizes not tied to any one authority. */
export const ANY_COUNTRY = "Any country";

export const COUNTRIES: Country[] = COUNTRY_SHEET;
const COUNTRY_BY_NAME = new Map(COUNTRIES.map(c => [c.name, c]));

export const PRESETS: Preset[] = SHEET.map((row, i) => {
  const country = COUNTRY_BY_NAME.get(row.country)!;
  return {
    ...row,
    name: row.country,
    region: country.region,
    code: country.code,
    primary: i === 0 || SHEET[i - 1].country !== row.country,
    common: country.featured
  };
});

export const REGIONS: Region[] = ["Americas", "Asia & Pacific", "Europe", "Middle East", "Africa", "Worldwide"];

/** Each country's main document, in list order — one row per country in the picker. */
export const PRIMARY_PRESETS: Preset[] = PRESETS.filter(p => p.primary);

const BY_COUNTRY = new Map<string, Preset[]>();
for (const p of PRESETS) {
  const list = BY_COUNTRY.get(p.country) ?? [];
  list.push(p);
  BY_COUNTRY.set(p.country, list);
}

/** Every document for a country, main one first. */
export function documentsFor(country: string): Preset[] {
  return BY_COUNTRY.get(country) ?? [];
}

export function countryInfo(name: string): Country | undefined {
  return COUNTRY_BY_NAME.get(name);
}

/** A country's documents grouped by category, in category order. */
export function documentsByCategory(country: string): { category: Category; documents: Preset[] }[] {
  const docs = documentsFor(country);
  return CATEGORIES
    .map(category => ({ category, documents: docs.filter(d => d.category === category) }))
    .filter(g => g.documents.length > 0);
}

/**
 * "Green Card" and "UC Berkeley Cal 1 Card" are names and keep their capitals in a title;
 * "Passport" and "Driving licence" are ordinary words and don't: "India passport".
 */
function inTitle(doc: string): string {
  const ordinary = /^[A-ZÀ-Ý][a-zà-ÿ'’-]*(\s|$)/.test(doc) && !/\s[A-Z][a-z]/.test(doc);
  return ordinary ? doc[0].toLowerCase() + doc.slice(1) : doc;
}

/** "PAN card · online" — the document within its country. */
export function documentLabel(p: Preset): string {
  return p.variant ? `${p.doc} · ${p.variant}` : p.doc;
}

/** "India PAN card (online)", "United States passport" — the document as a person would name it. */
export function presetTitle(p: Preset): string {
  const base = p.country === ANY_COUNTRY ? p.doc : `${p.name} ${inTitle(p.doc)}`;
  return p.variant ? `${base} (${p.variant})` : base;
}

/** Accepted backgrounds for a preset, falling back to plain white. */
export function backgroundsFor(preset?: Preset): BackgroundOption[] {
  const list = preset?.backgrounds;
  return list && list.length > 0 ? list : [WHITE];
}

/** The colour to apply when this document is chosen. */
export function defaultBackgroundColor(preset?: Preset): string {
  return backgroundsFor(preset)[0].color;
}

/** "Light grey or cream" — read out of the same data that sets the colour. */
export function backgroundLabel(preset?: Preset): string {
  return backgroundsFor(preset)
    .map((b, i) => (i === 0 ? b.label : b.label.toLowerCase()))
    .join(" or ");
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // Türkiye -> Turkiye
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * URL path segments for a document's own page: ["india"] for a country's main document,
 * ["india", "pan-card-online"] for the rest.
 *
 * Shared by the app's router and the build-time prerenderer, so a page can never be
 * generated at a path the app doesn't recognise.
 */
export function slugsFor(p: Preset): string[] {
  return p.primary ? [slugify(p.name)] : [slugify(p.name), slugify(`${p.doc} ${p.variant ?? ""}`)];
}

const BY_SLUG = new Map(PRESETS.map(p => [slugsFor(p).join("/"), p]));

export function findPresetBySlugs(country: string, doc?: string): Preset | undefined {
  return BY_SLUG.get(doc ? `${country}/${doc}` : country);
}

export function presetCode(p: Preset): string {
  return p.code;
}

const BY_ID = new Map(PRESETS.map(p => [p.id, p]));

export function findPreset(id?: string): Preset | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/**
 * The country the browser's languages name, if we have it. "en-US" is many browsers'
 * default wherever they are, so a later, more specific region wins over it: a browser set
 * to "en-US, en-IN, ta-IN" is in India.
 */
export function browserCountry(languages: readonly string[]): Country | undefined {
  const regions = languages
    .map(tag => tag.split("-")[1]?.toUpperCase())
    .filter((r): r is string => !!r && r.length === 2);
  const preferred = regions.find(r => r !== "US") ?? regions[0];
  return preferred ? COUNTRIES.find(c => c.iso2 === preferred) : undefined;
}

/** The document to start on: the main document of the browser's country, else India's passport. */
export function defaultPresetId(languages: readonly string[] = []): string {
  const country = browserCountry(languages);
  return documentsFor(country?.name ?? "India")[0]?.id ?? PRESETS[0].id;
}

/** Target chin-to-crown fraction for a preset — the published figure, or the middle of the range. */
export function headTargetFor(preset?: Preset): number {
  const range = preset?.head ?? DEFAULT_HEAD;
  return range.target ?? (range.min + range.max) / 2;
}

/**
 * Other documents of the same country that take exactly the same photo — the same size,
 * framing, background and file limit. "The same photo works for…" saves a second session.
 */
export function samePhotoAs(p: Preset): Preset[] {
  const key = (d: Preset) =>
    JSON.stringify([d.width, d.height, d.unit, d.head, d.crownGap, d.eyeLine, d.backgrounds[0]?.color, d.fileKB, !!d.digitalOnly]);
  const k = key(p);
  return documentsFor(p.country).filter(d => d.id !== p.id && key(d) === k);
}

export function formatSize(p: { width: number; height: number; unit: Unit }): string {
  const f = (n: number) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));
  return `${f(p.width)} × ${f(p.height)} ${p.unit}`;
}

/** "under 240 KB", "10 KB – 1 MB". */
export function formatFileKB(kb: { min?: number; max: number }): string {
  const f = (n: number) => (n >= 1024 ? `${+(n / 1024).toFixed(1)} MB` : `${Math.round(n)} KB`);
  return kb.min ? `${f(kb.min)} – ${f(kb.max)}` : `under ${f(kb.max)}`;
}

/** The host of a source link, for a short visible label. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Labels for a document's source links: the host, numbered where one host appears twice. */
export function sourceLabels(urls: string[]): { url: string; label: string }[] {
  const seen = new Map<string, number>();
  return urls.map(url => {
    const host = sourceHost(url);
    const n = (seen.get(host) ?? 0) + 1;
    seen.set(host, n);
    return { url, label: n > 1 ? `${host} (${n})` : host };
  });
}

// ---------------------------------------------------------------- search

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[×х*]/g, "x");

/** Sizes as people type them: "35x45", "35x45mm", "3.5x4.5cm", "2x2in", "2x2 inch", "600x600px". */
function sizeTerms(p: Preset): string[] {
  const n = (v: number) => String(+v.toFixed(2));
  const w = n(p.width), h = n(p.height);
  const terms = [`${w}x${h}`, `${w}x${h}${p.unit}`];
  if (p.unit === "mm") terms.push(`${n(p.width / 10)}x${n(p.height / 10)}`, `${n(p.width / 10)}x${n(p.height / 10)}cm`);
  if (p.unit === "in") terms.push(`${w}x${h}inch`);
  return terms;
}

type Indexed = {
  preset: Preset;
  country: string[];
  doc: string;
  variant: string;
  category: string;
  sizes: string[];
  note: string;
};

const INDEX: Indexed[] = PRESETS.map(p => {
  const c = COUNTRY_BY_NAME.get(p.country)!;
  return {
    preset: p,
    country: [p.name, c.code, ...c.aliases].map(fold),
    doc: fold(p.doc),
    variant: fold(p.variant ?? ""),
    category: fold(p.category),
    sizes: sizeTerms(p),
    note: fold(p.note ?? "")
  };
});

const words = (s: string) => s.split(/[^a-z0-9.]+/).filter(Boolean);

/** How well one query word matches a document; 0 for no match. Country and name beat notes. */
function wordScore(q: string, d: Indexed): number {
  let best = 0;
  const take = (n: number) => { if (n > best) best = n; };
  for (const c of d.country) {
    if (c === q) take(60);
    else if (c.startsWith(q)) take(40);
    else if (words(c).some(w => w.startsWith(q))) take(30);
  }
  if (d.doc === q) take(50);
  else if (words(d.doc).some(w => w === q)) take(36);
  else if (words(d.doc).some(w => w.startsWith(q))) take(26);
  else if (d.doc.includes(q) && q.length >= 3) take(14);
  if (words(d.variant).some(w => w.startsWith(q))) take(16);
  if (words(d.category).some(w => w.startsWith(q))) take(18);
  if (d.sizes.some(s => s === q || s === q.replace(/(mm|cm|in|inch|px)$/, ""))) take(34);
  if (q.length >= 4 && words(d.note).some(w => w.startsWith(q))) take(6);
  return best;
}

/**
 * Documents matching a free-text query, best first.
 *
 * Every word has to match something — "india pan" finds India's PAN cards, not every Indian
 * document plus every PAN. A word scores most on the country (or its other names: "uk",
 * "schengen"), then the document's own name, then sizes ("3x4", "2x2in"), and least on the
 * notes. Ties go to a country's main document, then sheet order.
 */
export function searchPresets(query: string): Preset[] {
  const phrase = fold(query.trim());
  const terms = words(phrase);
  if (terms.length === 0) return PRESETS;
  const scored: { p: Preset; score: number; order: number }[] = [];
  INDEX.forEach((d, order) => {
    let score = 0;
    for (const t of terms) {
      const s = wordScore(t, d);
      if (s === 0) return;
      score += s;
    }
    // The whole query naming the document beats its words matching here and there:
    // "green card" is the US Green Card before China's "Permanent residence card (Green Card)".
    if (d.doc === phrase) score += 40;
    else if (d.doc.startsWith(phrase)) score += 20;
    if (d.preset.primary) score += 4;
    if (d.preset.common) score += 2;
    // A bare size ("3x4", "2x2") is most often wanted as the plain standard size.
    if (d.preset.country === ANY_COUNTRY) score += 6;
    scored.push({ p: d.preset, score, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map(s => s.p);
}

/**
 * Countries whose name or other names match the query, best first: an exact name, code or
 * alias ("uk" → United Kingdom), then a name that starts with it ("ukr" → Ukraine), then
 * any word that does.
 */
export function searchCountries(query: string): Country[] {
  const q = fold(query.trim());
  if (!q) return [];
  const score = (c: Country) => {
    const names = [c.name, c.code, ...c.aliases].map(fold);
    if (names.includes(q)) return 3;
    if (fold(c.name).startsWith(q)) return 2;
    if (names.some(n => n.startsWith(q) || words(n).some(w => w.startsWith(q)))) return 1;
    return 0;
  };
  return COUNTRIES.map(c => ({ c, s: score(c) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.c);
}
