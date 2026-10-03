import type { Unit } from "../types";
import SHEET from "../../specs/documents.csv";

/**
 * Photo specifications by country and document.
 *
 * The data lives in specs/documents.csv — a spreadsheet, so a new document or a corrected
 * figure is a row edited in Excel, not a code change. It is read and checked at build time
 * by scripts/specs.mjs; this file turns the rows into the presets the app runs on and
 * holds the helpers around them.
 *
 * A country is not one specification. India alone asks for a 35x45mm print for a passport, a
 * 51x51mm square for OCI, a 213px square under 30KB for a PAN card upload and a 420x525px one
 * under 20KB for a driving licence. So every preset here is a *document*, and documents are
 * grouped by country.
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
 * `head` is the chin-to-crown height as a fraction of the photo height, taken from the
 * published requirement where there is a clear one. Where a document doesn't publish a
 * figure, `head` is left out and a neutral ICAO-style default is used instead.
 */

export type Region = "Africa" | "Americas" | "Asia & Pacific" | "Europe" | "Middle East";

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

/** One row of the sheet, as scripts/specs.mjs hands it over. */
export type SheetRow = {
  id: string;
  /** Country name, as a traveller would look for it. Rows are grouped by it. */
  country: string;
  region: Region;
  /** What the document is: "Passport", "PAN card (upload)". */
  doc: string;
  /** Three-letter badge shown in the picker. Defaults to the first three of `id`. */
  code?: string;
  width: number;
  height: number;
  /** "px" for documents that are only ever uploaded, never printed. */
  unit: Unit;
  /** Chin-to-crown height as a fraction of photo height. */
  head?: Range;
  /** Space from the top of the photo to the top of the hair, as a fraction of photo height. */
  crownGap?: number;
  /** Eye line, measured up from the bottom edge, as a fraction of photo height. */
  eyeLine?: Range;
  /** Accepted backgrounds, most standard first. The first one is applied automatically. */
  backgrounds: BackgroundOption[];
  /** File size the upload form accepts, in kilobytes. Downloads are compressed to fit. */
  fileKB?: { min?: number; max: number };
  /** Upload only: there is no print sheet, and the pixel size is the requirement. */
  digitalOnly?: boolean;
  /** Anything else worth knowing before printing or uploading. */
  note?: string;
  /** The authority's own page for this requirement. */
  source?: string;
  /** Shown in the "Common" row at the top of the picker. */
  common: boolean;
};

export type Preset = SheetRow & {
  /** Country name — the same as `country`, named for the places that print it. */
  name: string;
  /** True for the first row listed for its country. */
  primary: boolean;
};

/** Used when a document publishes no chin-to-crown figure. Mid-range for ICAO photos. */
export const DEFAULT_HEAD: Range = { min: 0.6, max: 0.7 };

export const PRESETS: Preset[] = SHEET.map((row, i) => ({
  ...row,
  name: row.country,
  primary: SHEET.findIndex(o => o.country === row.country) === i
}));

export const REGIONS: Region[] = ["Americas", "Asia & Pacific", "Europe", "Middle East", "Africa"];

/** Each country's primary document, in list order — one row per country in the picker. */
export const PRIMARY_PRESETS: Preset[] = PRESETS.filter(p => p.primary);

/** Every document for a country, primary first. */
export function documentsFor(country: string): Preset[] {
  return PRESETS.filter(p => p.country === country);
}

/** "India PAN card", "United States passport" — the document as a person would name it. */
export function presetTitle(p: Preset): string {
  // Keep acronyms ("PAN", "DV", "OCI") as written; lower-case only an ordinary leading word.
  const doc = /^[A-Z][a-z]/.test(p.doc) ? p.doc[0].toLowerCase() + p.doc.slice(1) : p.doc;
  return `${p.name} ${doc}`;
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
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * URL path segments for a document's own page: ["india"] for a country's primary document,
 * ["india", "pan-card-upload"] for the rest.
 *
 * Shared by the app's router and the build-time prerenderer, so a page can never be
 * generated at a path the app doesn't recognise.
 */
export function slugsFor(p: Preset): string[] {
  return p.primary ? [slugify(p.name)] : [slugify(p.name), slugify(p.doc)];
}

export function findPresetBySlugs(country: string, doc?: string): Preset | undefined {
  return PRESETS.find(p => {
    const [c, d] = slugsFor(p);
    return c === country && d === doc;
  });
}

export function presetCode(p: Preset): string {
  return p.code ?? p.id.slice(0, 3);
}

export function findPreset(id?: string): Preset | undefined {
  if (!id) return undefined;
  return PRESETS.find(p => p.id === id);
}

/** Target chin-to-crown fraction for a preset — the midpoint of the allowed range. */
export function headTargetFor(preset?: Preset): number {
  const range = preset?.head ?? DEFAULT_HEAD;
  return (range.min + range.max) / 2;
}

export function formatSize(p: { width: number; height: number; unit: Unit }): string {
  const w = Number.isInteger(p.width) ? p.width : p.width.toFixed(1);
  const h = Number.isInteger(p.height) ? p.height : p.height.toFixed(1);
  return `${w} × ${h} ${p.unit}`;
}

/** "under 240 KB", "10 KB – 1 MB". */
export function formatFileKB(kb: { min?: number; max: number }): string {
  const f = (n: number) => (n >= 1024 ? `${+(n / 1024).toFixed(1)} MB` : `${n} KB`);
  return kb.min ? `${f(kb.min)} – ${f(kb.max)}` : `under ${f(kb.max)}`;
}

/**
 * Case- and accent-insensitive match on country, document, code or note.
 *
 * "pan" finds the PAN card, "green card" finds the US passport (whose note covers it),
 * "india" finds every one of India's documents.
 */
export function searchPresets(query: string): Preset[] {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = fold(query.trim());
  if (!q) return PRESETS;
  return PRESETS.filter(p =>
    [p.name, p.doc, p.id, p.note ?? ""].some(field => fold(field).includes(q))
  );
}
