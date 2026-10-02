import { findPresetBySlug, slugFor, type Preset } from "./presets";

/**
 * Country pages live at /passport-photo/<slug>.
 *
 * Each one is a real static file written at build time (see scripts/prerender.mjs), so it
 * has its own title, description and visible requirements text — a query parameter on a
 * single client-rendered page cannot be indexed as fifty-three different pages, and the
 * per-country specs are the most searched-for thing here.
 */
export const COUNTRY_PATH_PREFIX = "/passport-photo";

export function pathForPreset(preset: Preset): string {
  return `${COUNTRY_PATH_PREFIX}/${slugFor(preset)}`;
}

/** The preset implied by the current URL path, if the path names one. */
export function presetFromPath(pathname = window.location.pathname): Preset | undefined {
  const match = pathname.replace(/\/+$/, "").match(/^\/passport-photo\/([a-z0-9-]+)$/i);
  if (!match) return undefined;
  return findPresetBySlug(match[1].toLowerCase());
}
