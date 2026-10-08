/**
 * Reads the photo-requirement sheets into the document list the app runs on:
 *
 *   specs/countries.csv  — one row per country: its code, region, whether it is featured,
 *                          and the other names people search it by
 *   specs/documents.csv  — one row per document: size, head and eye position, background,
 *                          file-size limit, notes and official sources
 *
 * The sheets are meant to be edited by someone who doesn't write code, in Excel or Google
 * Sheets. So this file is deliberately forgiving about how a spreadsheet saves (a byte-order
 * mark, semicolons instead of commas in European Excel, "70%" or "34.5 mm", "Yes" or "y")
 * and strict about what the data means: every problem is reported with the file, row and
 * column as the editor sees them, and the build stops rather than shipping a wrong spec.
 *
 * Used by vite.config.ts (dev server and build) and scripts/prerender.mjs, so the app and the
 * static pages can never read the sheets differently. See specs/README.md for the columns.
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

export const REGIONS = ["Americas", "Asia & Pacific", "Europe", "Middle East", "Africa", "Worldwide"];

/** In the order a country's documents are grouped in the picker. */
export const CATEGORIES = [
  "Passport", "Visa", "Residence & immigration", "ID card", "Driving licence",
  "Licences & permits", "Education & exams", "Cards & passes", "Standard sizes", "Other"
];

/**
 * A published head height or eye line is usually one figure ("34.5 mm"). The photo is
 * framed to that figure and checked within this many percent of the photo height either
 * side of it. Where a sheet gives a range ("32-36mm") the range is used as published.
 */
export const SINGLE_VALUE_TOLERANCE = 0.03;

const UNITS = ["mm", "cm", "in", "px"];
const MM_PER = { mm: 1, cm: 10, in: 25.4 };

const COUNTRY_COLUMNS = ["country", "code", "iso2", "region", "featured", "aliases"];
const DOCUMENT_COLUMNS = [
  "id", "country", "document", "variant", "category",
  "width", "height", "unit", "head", "top_gap", "eye_line",
  "background", "file_kb_min", "file_kb_max", "upload_only", "note", "source"
];

/** Units as people write them, to the four the app uses. */
const UNIT_ALIASES = {
  mm: "mm", millimetre: "mm", millimetres: "mm", millimeter: "mm", millimeters: "mm",
  cm: "cm", centimetre: "cm", centimetres: "cm", centimeter: "cm", centimeters: "cm",
  in: "in", inch: "in", inches: "in", '"': "in",
  px: "px", pixel: "px", pixels: "px",
  "%": "%"
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

export function slugify(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/×/g, "x")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Split a sheet into header-keyed rows, after the checks every sheet shares: encoding,
 * delimiter, and a header row with exactly the expected columns.
 */
function readSheet(text, fileName, columns) {
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
  const missing = columns.filter(c => !header.includes(c));
  if (missing.length) {
    throw new Error(`${fileName}: missing column(s) ${missing.map(c => `"${c}"`).join(", ")}. The header row must be: ${columns.join(", ")}`);
  }
  const unknown = header.filter(h => h && !columns.includes(h));
  if (unknown.length) {
    throw new Error(`${fileName}: unknown column(s) ${unknown.map(c => `"${c}"`).join(", ")} — check the spelling in the header row.`);
  }

  // Numbered as in a spreadsheet: the header is row 1.
  return grid.slice(1).map((cells, index) => ({
    line: index + 2,
    get: col => (cells[header.indexOf(col)] ?? "").trim()
  }));
}

const isYes = v => ["yes", "y", "true", "1", "x"].includes(v.toLowerCase());
const isNo = v => !v || ["no", "n", "false", "0"].includes(v.toLowerCase());

/**
 * "34.5mm", "32-36 mm", "70%", "70–80%", "1.29in", "300px" → { lo, hi, unit }.
 * Returns a string describing the problem instead when the cell can't be read.
 */
function readMeasure(raw) {
  const m = raw
    .replace(/,/g, ".")
    .match(/^(\d+(?:\.\d+)?)\s*(?:(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(mm|cm|in|inch|inches|px|pixels?|%|")$/i);
  if (!m) return `"${raw}" should be a number with its unit, like 34.5mm, 70%, 1.29in or 32-36mm`;
  const unit = UNIT_ALIASES[m[3].toLowerCase()];
  const lo = Number(m[1]);
  const hi = m[2] !== undefined ? Number(m[2]) : lo;
  if (lo > hi) return `"${raw}": the first number is larger than the second`;
  return { lo, hi, unit, range: m[2] !== undefined };
}

/** A measurement as a fraction of the photo height, given the photo's own unit and height. */
function toFraction(value, measureUnit, photoUnit, photoHeight) {
  if (measureUnit === "%") return value / 100;
  if (measureUnit === "px" || photoUnit === "px") {
    return measureUnit === photoUnit ? value / photoHeight : undefined;
  }
  return (value * MM_PER[measureUnit]) / (photoHeight * MM_PER[photoUnit]);
}

/** Parse countries.csv into a map keyed by country name. */
function parseCountries(text, fileName, problems) {
  const countries = new Map();
  const codes = new Map();

  for (const { line, get } of readSheet(text, fileName, COUNTRY_COLUMNS)) {
    const fail = (col, msg) => problems.push(`${fileName} row ${line}, ${col}: ${msg}`);
    const name = get("country");
    const code = get("code").toUpperCase();
    const region = get("region");
    if (!name) { fail("country", "is required"); continue; }
    if (countries.has(name)) { fail("country", `"${name}" is already listed on row ${countries.get(name).line}`); continue; }
    if (!/^[A-Z]{2,3}$/.test(code)) fail("code", `"${get("code")}" should be the country's 3-letter code, like IND`);
    else if (codes.has(code)) fail("code", `"${code}" is already used by ${codes.get(code)}`);
    codes.set(code, name);
    if (get("iso2") && !/^[A-Za-z]{2}$/.test(get("iso2"))) fail("iso2", `"${get("iso2")}" should be the 2-letter code, like IN`);
    if (!REGIONS.includes(region)) fail("region", `"${region}" should be one of: ${REGIONS.join(", ")}`);
    if (!isYes(get("featured")) && !isNo(get("featured"))) fail("featured", `"${get("featured")}" should be yes or left blank`);

    countries.set(name, {
      name,
      code,
      iso2: get("iso2").toUpperCase(),
      region,
      featured: isYes(get("featured")),
      aliases: get("aliases").split(/\s*;\s*/).filter(Boolean),
      line
    });
  }
  return countries;
}

/**
 * Parse and check both sheets. Throws one Error listing every problem found, so an editor
 * can fix them all in one pass rather than one per build.
 *
 * Returns { countries, documents }: countries in sheet order, documents with each country's
 * documents together and its first row first (that row is the country's main document).
 */
export function parseSpecs(documentsText, countriesText, files = {}) {
  const docFile = files.documents ?? "specs/documents.csv";
  const countryFile = files.countries ?? "specs/countries.csv";
  const problems = [];
  const countries = parseCountries(countriesText, countryFile, problems);

  const documents = [];
  const ids = new Map();          // id -> sheet row
  const slugs = new Map();        // "country/document variant" -> sheet row
  const firstRow = new Map();     // country -> its first document row, for generated ids
  const lastSeen = new Map();     // country -> last row it appeared on, to keep rows together

  for (const { line, get } of readSheet(documentsText, docFile, DOCUMENT_COLUMNS)) {
    const fail = (col, msg) => problems.push(`${docFile} row ${line}, ${col}: ${msg}`);

    for (const col of ["country", "document", "category", "unit"]) if (!get(col)) fail(col, "is required");

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
      if (isYes(get(col))) return true;
      if (!isNo(get(col))) fail(col, `"${get(col)}" should be yes or left blank`);
      return false;
    };

    const countryName = get("country");
    const country = countries.get(countryName);
    if (countryName && !country) fail("country", `"${countryName}" is not in ${countryFile} — add it there first`);
    // A country's first row is its main document, so its rows have to stay together.
    if (country && lastSeen.has(countryName) && documents.at(-1)?.country !== countryName) {
      fail("country", `${countryName}'s rows should be together; it also appears on row ${lastSeen.get(countryName)}`);
    }
    if (countryName) lastSeen.set(countryName, line);

    const doc = get("document");
    const variant = get("variant");
    const category = get("category");
    if (category && !CATEGORIES.includes(category)) fail("category", `"${category}" should be one of: ${CATEGORIES.join(", ")}`);

    const unit = UNIT_ALIASES[get("unit").toLowerCase()] ?? "";
    if (get("unit") && (!unit || unit === "%")) fail("unit", `"${get("unit")}" should be one of: ${UNITS.join(", ")}`);

    const width = number("width", { required: true, min: 0.1, max: 10000 });
    const height = number("height", { required: true, min: 0.1, max: 10000 });

    /** A measurement cell as a fraction of the photo height, with its tolerance band. */
    const measure = (col, { min, max }) => {
      const raw = get(col);
      if (!raw || !unit || unit === "%" || !height) return undefined;
      const m = readMeasure(raw);
      if (typeof m === "string") { fail(col, m); return undefined; }
      const lo = toFraction(m.lo, m.unit, unit, height);
      const hi = toFraction(m.hi, m.unit, unit, height);
      if (lo === undefined || hi === undefined) {
        fail(col, `"${raw}" is in ${m.unit} but the photo is sized in ${unit} — use ${unit === "px" ? "px or %" : "mm, cm, in or %"}`);
        return undefined;
      }
      if (lo < min || hi > max) {
        fail(col, `"${raw}" is ${Math.round(lo * 100)}${m.range ? `–${Math.round(hi * 100)}` : ""}% of the photo height, outside ${min * 100}–${max * 100}%`);
        return undefined;
      }
      const r = n => Math.round(n * 10000) / 10000;
      return m.range
        ? { min: r(lo), max: r(hi) }
        : { min: r(lo - SINGLE_VALUE_TOLERANCE), max: r(hi + SINGLE_VALUE_TOLERANCE), target: r(lo) };
    };

    const head = measure("head", { min: 0.2, max: 0.95 });
    const gap = measure("top_gap", { min: 0, max: 0.5 });
    const eyeLine = measure("eye_line", { min: 0.3, max: 0.9 });

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
    if (unit === "px" && !uploadOnly) fail("upload_only", "a document sized in px is upload only — put yes");

    // Ids keep shared links working, so existing ones are never changed. A blank id gets one
    // made from the country's code and the document name.
    let id = get("id");
    if (!id && country && doc) {
      id = `${country.code}-${slugify(`${doc} ${variant}`).toUpperCase()}`;
    }
    if (id && !/^[A-Za-z0-9-]+$/.test(id)) fail("id", `"${id}" may only use letters, digits and "-"`);
    if (id && ids.has(id)) fail("id", `"${id}" is already used on row ${ids.get(id)}`);
    if (id) ids.set(id, line);
    if (country && !firstRow.has(countryName)) firstRow.set(countryName, line);

    const slugKey = `${slugify(countryName)}/${slugify(`${doc} ${variant}`)}`;
    if (countryName && doc && slugs.has(slugKey)) {
      fail("variant", `${countryName} already has "${doc}${variant ? ` (${variant})` : ""}" on row ${slugs.get(slugKey)} — add or change the variant to tell them apart`);
    }
    slugs.set(slugKey, line);

    const sources = get("source").split(/\s*;\s*|\s+(?=https?:\/\/)/).filter(Boolean);
    for (const s of sources) {
      if (!/^https?:\/\/[^\s]+$/.test(s)) fail("source", `"${s}" should be a web address starting with https://`);
    }

    const entry = { id, country: countryName, doc, category, width, height, unit, backgrounds };
    if (variant) entry.variant = variant;
    if (head) entry.head = head;
    if (gap) entry.crownGap = gap.target ?? (gap.min + gap.max) / 2;
    if (eyeLine) entry.eyeLine = eyeLine;
    if (kbMax !== undefined) entry.fileKB = kbMin ? { min: kbMin, max: kbMax } : { max: kbMax };
    if (uploadOnly) entry.digitalOnly = true;
    if (get("note")) entry.note = get("note");
    if (sources.length) entry.sources = sources;
    documents.push(entry);
  }

  for (const c of countries.values()) {
    if (!firstRow.has(c.name)) problems.push(`${countryFile} row ${c.line}: ${c.name} has no documents in ${docFile}`);
  }

  if (problems.length) {
    const shown = problems.slice(0, 60);
    throw new Error(
      `The photo requirement sheets have ${problems.length} problem(s):\n  - ${shown.join("\n  - ")}` +
      (problems.length > shown.length ? `\n  … and ${problems.length - shown.length} more` : "")
    );
  }

  return {
    countries: [...countries.values()].map(({ line: _line, ...c }) => c),
    documents
  };
}

/**
 * The JavaScript module the app imports for specs/documents.csv: the documents as the default
 * export, the countries as a named one. Shared by the Vite plugin and the prerenderer.
 */
export function specsModule(documentsText, countriesText) {
  const { countries, documents } = parseSpecs(documentsText, countriesText);
  return `export const countries = ${JSON.stringify(countries)};\nexport default ${JSON.stringify(documents)};`;
}
