import { findPresetBySlugs, slugsFor, type Preset } from "./presets";

/**
 * Document pages live at /photo/<country> for a country's primary document and
 * /photo/<country>/<document> for the rest: /photo/india, /photo/india/pan-card-upload.
 *
 * Each one is a real static file written at build time (see scripts/prerender.mjs), so it
 * has its own title, description and visible requirements text — a query parameter on a
 * single client-rendered page cannot be indexed as separate pages, and the per-document
 * specs are the most searched-for thing here.
 *
 * The old /passport-photo/<country> paths are redirected here by the host (vercel.json,
 * public/_redirects).
 */
export const DOC_PATH_PREFIX = "/photo";

export function pathForPreset(preset: Preset): string {
  return `${DOC_PATH_PREFIX}/${slugsFor(preset).join("/")}`;
}

/** The preset implied by the current URL path, if the path names one. */
export function presetFromPath(pathname = window.location.pathname): Preset | undefined {
  const match = pathname
    .replace(/\/+$/, "")
    .toLowerCase()
    .match(/^\/photo\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/);
  if (!match) return undefined;
  return findPresetBySlugs(match[1], match[2]);
}
