/**
 * Reads specs/documents.csv — the spreadsheet of photo requirements — into the document
 * list the app runs on.
 *
 * The sheet is meant to be edited by someone who doesn't write code, in Excel or Google
 * Sheets. So this file is deliberately forgiving about how a spreadsheet saves (a byte-order
 * mark, semicolons instead of commas in European Excel, "70%" instead of 70, "Yes" or "y")
 * and strict about what the data means: every problem is reported with the row number and
 * column as the editor sees them, and the build stops rather than shipping a wrong spec.
 *
 * Used by vite.config.ts (dev server and build) and scripts/prerender.mjs, so the app and the
 * static pages can never read the sheet differently. See specs/README.md for the columns.
 */

/** Background colours by the names the sheet uses. A "#rrggbb" value is also accepted. */
export const BACKGROUND_COLOURS = {
  "white": "#ffffff",
  "off-white": "#f7f7f7",
  "light grey": "#e4e4e4",
  "cream": "#f1e9d8",
  "light blue": "#ccddee",
  "blue": "#4c74b2",
  "red": "#c62828"
};

export const REGIONS = ["Americas", "Asia & Pacific", "Europe", "Middle East", "Africa"];
const UNITS = ["mm", "cm", "in", "px"];

const COLUMNS = [
  "id", "country", "region", "featured", "document", "badge",
  "width", "height", "unit",
  "head_min_%", "head_max_%", "top_gap_%", "eye_min_%", "eye_max_%",
  "background", "file_kb_min", "file_kb_max", "upload_only", "note", "source"
];
/** Width and height are numbers, and are checked as such below. */
const REQUIRED = ["country", "region", "document", "unit"];

/** Units as people write them, to the four the app uses. */
const UNIT_ALIASES = {
  mm: "mm", millimetre: "mm", millimetres: "mm", millimeter: "mm", millimeters: "mm",
  cm: "cm", centimetre: "cm", centimetres: "cm", centimeter: "cm", centimeters: "cm",
  in: "in", inch: "in", inches: "in", '"': "in",
  px: "px", pixel: "px", pixels: "px"
};

/** RFC 4180: quoted fields may hold the delimiter, newlines and "" for a quote. */
function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function slugify(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Parse and check the sheet. Throws one Error listing every problem found, so an editor can
 * fix them all in one pass rather than one per build.
 */
export function parseSpecs(text, fileName = "specs/documents.csv") {
  const problems = [];

  // Excel saves a BOM with "CSV UTF-8"; a plain "CSV" save uses the local code page, which
  // turns "Türkiye" or "–" into replacement characters.
  text = text.replace(/^﻿/, "");
  if (text.includes("�")) {
    throw new Error(
      `${fileName}: some characters were saved in the wrong encoding (look for "�"). ` +
      `In Excel use File → Save As → "CSV UTF-8 (Comma delimited)".`
    );
  }

  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const grid = parseCsv(text, delimiter).filter(r => r.some(c => c.trim() !== ""));
  if (grid.length < 2) throw new Error(`${fileName}: the sheet has no rows.`);

  const header = grid[0].map(h => h.trim().toLowerCase());
  const missing = COLUMNS.filter(c => !header.includes(c));
  if (missing.length) {
    throw new Error(`${fileName}: missing column(s) ${missing.map(c => `"${c}"`).join(", ")}. The header row must be: ${COLUMNS.join(", ")}`);
  }
  const unknown = header.filter(h => h && !COLUMNS.includes(h));
  if (unknown.length) {
    throw new Error(`${fileName}: unknown column(s) ${unknown.map(c => `"${c}"`).join(", ")} — check the spelling in the header row.`);
  }

  const documents = [];
  const countries = new Map();   // country name -> { region, primaryId, featured, row }
  const ids = new Map();          // id -> sheet row
  const slugs = new Map();        // "country/document" -> sheet row

  grid.slice(1).forEach((cells, index) => {
    const line = index + 2;       // as numbered in a spreadsheet: header is row 1
    const get = col => (cells[header.indexOf(col)] ?? "").trim();
    const fail = (col, msg) => problems.push(`row ${line}, ${col}: ${msg}`);

    for (const col of REQUIRED) if (!get(col)) fail(col, "is required");

    const number = (col, { required = false, min = 0, max = Infinity } = {}) => {
      const raw = get(col).replace(/%$/, "").replace(",", ".").trim();
      if (!raw) {
        if (required) fail(col, "is required");
        return undefined;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) { fail(col, `"${get(col)}" is not a number`); return undefined; }
      if (n < min || n > max) { fail(col, `${n} should be between ${min} and ${max}`); return undefined; }
      return n;
    };
    const yes = col => {
      const v = get(col).toLowerCase();
      if (!v || ["no", "n", "false", "0"].includes(v)) return false;
      if (["yes", "y", "true", "1", "x"].includes(v)) return true;
      fail(col, `"${get(col)}" should be yes or left blank`);
      return false;
    };
    /** A min/max pair given in percent of the photo height, as a 0..1 range. */
    const range = (minCol, maxCol) => {
      const lo = number(minCol, { max: 100 });
      const hi = number(maxCol, { max: 100 });
      if (lo === undefined && hi === undefined) return undefined;
      if (lo === undefined || hi === undefined) {
        fail(lo === undefined ? minCol : maxCol, `fill in both ${minCol} and ${maxCol}, or neither`);
        return undefined;
      }
      if (lo > hi) { fail(minCol, `${lo} is larger than ${maxCol} (${hi})`); return undefined; }
      return { min: lo / 100, max: hi / 100 };
    };

    const country = get("country");
    const region = get("region");
    const doc = get("document");
    if (region && !REGIONS.includes(region)) fail("region", `"${region}" should be one of: ${REGIONS.join(", ")}`);

    const unit = UNIT_ALIASES[get("unit").toLowerCase()] ?? "";
    if (get("unit") && !unit) fail("unit", `"${get("unit")}" should be one of: ${UNITS.join(", ")}`);

    const width = number("width", { required: true, min: 0.1, max: 5000 });
    const height = number("height", { required: true, min: 0.1, max: 5000 });

    const head = range("head_min_%", "head_max_%");
    const eyeLine = range("eye_min_%", "eye_max_%");
    const gap = number("top_gap_%", { max: 50 });

    const backgrounds = get("background")
      .split(/[,;/]|\bor\b/i)
      .map(s => s.trim())
      .filter(Boolean)
      .map(name => {
        if (/^#[0-9a-f]{6}$/i.test(name)) return { label: name, color: name.toLowerCase() };
        const color = BACKGROUND_COLOURS[name.toLowerCase()];
        if (!color) {
          fail("background", `"${name}" is not a known colour. Use ${Object.keys(BACKGROUND_COLOURS).join(", ")} or a #rrggbb code`);
          return null;
        }
        // Keep the editor's capitalisation of the first letter only: "Light grey".
        const label = name[0].toUpperCase() + name.slice(1).toLowerCase();
        return { label, color };
      })
      .filter(Boolean);

    const kbMin = number("file_kb_min", { max: 100000 });
    const kbMax = number("file_kb_max", { max: 100000 });
    if (kbMin !== undefined && kbMax === undefined) fail("file_kb_max", "is needed when file_kb_min is filled in");
    if (kbMin !== undefined && kbMax !== undefined && kbMin > kbMax) fail("file_kb_min", `${kbMin} is larger than file_kb_max (${kbMax})`);

    const uploadOnly = yes("upload_only");
    if (uploadOnly && unit && unit !== "px") fail("unit", "an upload_only document is sized in px");
    if (unit === "px" && !uploadOnly) fail("upload_only", "a document sized in px is upload only — put yes");

    // Countries: the first row for a country is its primary document and sets its region.
    const known = countries.get(country);
    if (country && known && region && known.region !== region) {
      fail("region", `"${region}" differs from row ${known.row}, which puts ${country} in "${known.region}"`);
    }

    // Ids keep shared links working, so existing ones are never changed. A blank id gets one
    // made from the country's primary id and the document name.
    let id = get("id");
    if (!id && country && doc) {
      id = known
        ? `${known.primaryId}-${slugify(doc).toUpperCase().replace(/-/g, "")}`
        : slugify(country).toUpperCase().replace(/-/g, "");
    }
    if (id && !/^[A-Za-z0-9-]+$/.test(id)) fail("id", `"${id}" may only use letters, digits and "-"`);
    if (id && ids.has(id)) fail("id", `"${id}" is already used on row ${ids.get(id)}`);
    if (id) ids.set(id, line);

    if (!known && country) countries.set(country, { region, primaryId: id, featured: false, row: line });
    if (yes("featured") && country) countries.get(country).featured = true;

    const slugKey = `${slugify(country)}/${slugify(doc)}`;
    if (country && doc && slugs.has(slugKey)) fail("document", `${country} already has a "${doc}" on row ${slugs.get(slugKey)}`);
    slugs.set(slugKey, line);

    const source = get("source");
    if (source && !/^https?:\/\//.test(source)) fail("source", "should be a web address starting with https://");

    const entry = {
      id, country, region, doc, width, height, unit,
      backgrounds
    };
    if (get("badge")) entry.code = get("badge");
    if (head) entry.head = head;
    if (gap !== undefined) entry.crownGap = gap / 100;
    if (eyeLine) entry.eyeLine = eyeLine;
    if (kbMax !== undefined) entry.fileKB = kbMin !== undefined ? { min: kbMin, max: kbMax } : { max: kbMax };
    if (uploadOnly) entry.digitalOnly = true;
    if (get("note")) entry.note = get("note");
    if (source) entry.source = source;
    documents.push(entry);
  });

  if (problems.length) {
    throw new Error(`${fileName} has ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
  }

  // Featured is a property of the country, whichever of its rows it was ticked on.
  for (const d of documents) d.common = countries.get(d.country).featured;
  return documents;
}
