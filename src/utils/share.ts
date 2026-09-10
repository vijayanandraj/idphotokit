import type { PhotoSpec, SheetSpec } from "../types";

type ShareState = {
  photo: Partial<PhotoSpec>;
  sheet: Partial<SheetSpec>;
};

export function encodeStateToUrl(state: ShareState) {
  const url = new URL(window.location.href);
  if (state.photo.presetId) url.searchParams.set("preset", state.photo.presetId);
  if (state.photo.width != null) url.searchParams.set("w", String(state.photo.width));
  if (state.photo.height != null) url.searchParams.set("h", String(state.photo.height));
  if (state.photo.unit) url.searchParams.set("unit", state.photo.unit);
  if (state.photo.dpi != null) url.searchParams.set("dpi", String(state.photo.dpi));

  if (state.sheet.paper) url.searchParams.set("paper", state.sheet.paper);

  window.history.replaceState({}, "", url.toString());
}

export function decodeStateFromUrl(): ShareState | null {
  const url = new URL(window.location.href);
  const preset = url.searchParams.get("preset") || undefined;
  const w = url.searchParams.get("w");
  const h = url.searchParams.get("h");
  const unit = url.searchParams.get("unit") || undefined;
  const dpi = url.searchParams.get("dpi");

  const paper = url.searchParams.get("paper") || undefined;

  const photo: Partial<PhotoSpec> = {};
  if (preset) (photo as any).presetId = preset;
  if (w) photo.width = Number(w);
  if (h) photo.height = Number(h);
  if (unit) (photo as any).unit = unit;
  if (dpi) photo.dpi = Number(dpi);

  const sheet: Partial<SheetSpec> = {};
  if (paper) (sheet as any).paper = paper;

  const hasAny = Object.keys(photo).length > 0 || Object.keys(sheet).length > 0;
  return hasAny ? { photo, sheet } : null;
}
