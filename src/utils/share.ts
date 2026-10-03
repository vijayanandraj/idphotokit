import type { PaperId, PhotoSpec, SheetSpec, Unit } from "../types";

type ShareState = {
  photo: Partial<PhotoSpec>;
  sheet: Partial<SheetSpec>;
};

/** `path` moves a document page to another document's page, e.g. /photo/india -> /photo/india/oci-card. */
export function encodeStateToUrl(state: ShareState, path?: string) {
  const url = new URL(window.location.href);
  if (path) url.pathname = path;
  if (state.photo.presetId) url.searchParams.set("preset", state.photo.presetId);
  if (state.photo.width != null) url.searchParams.set("w", String(state.photo.width));
  if (state.photo.height != null) url.searchParams.set("h", String(state.photo.height));
  if (state.photo.unit) url.searchParams.set("unit", state.photo.unit);
  if (state.photo.dpi != null) url.searchParams.set("dpi", String(state.photo.dpi));

  if (state.sheet.paper) url.searchParams.set("paper", state.sheet.paper);

  window.history.replaceState({}, "", url.toString());
}

const UNITS: readonly string[] = ["mm", "cm", "in", "px"];
const PAPERS: readonly string[] = ["A4", "A3", "P4x6", "CUSTOM"];

// A link is untrusted input, so anything we don't recognise is dropped rather than trusted.
// An unknown unit used to reach sizeToPx and fall through to inches, which quietly turned a
// 35x45mm photo into a 35x45 inch one — a canvas a hundred times too big.
function isUnit(v: string): v is Unit {
  return UNITS.includes(v);
}

function isPaper(v: string): v is PaperId {
  return PAPERS.includes(v);
}

/** A measurement we can actually use: "abc" and "-1" both become undefined, not NaN. */
function positive(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function decodeStateFromUrl(): ShareState | null {
  const q = new URL(window.location.href).searchParams;

  const photo: Partial<PhotoSpec> = {};
  const preset = q.get("preset");
  if (preset) photo.presetId = preset;
  const w = positive(q.get("w"));
  if (w != null) photo.width = w;
  const h = positive(q.get("h"));
  if (h != null) photo.height = h;
  const unit = q.get("unit");
  if (unit && isUnit(unit)) photo.unit = unit;
  const dpi = positive(q.get("dpi"));
  if (dpi != null) photo.dpi = dpi;

  const sheet: Partial<SheetSpec> = {};
  const paper = q.get("paper");
  if (paper && isPaper(paper)) sheet.paper = paper;

  const hasAny = Object.keys(photo).length > 0 || Object.keys(sheet).length > 0;
  return hasAny ? { photo, sheet } : null;
}
