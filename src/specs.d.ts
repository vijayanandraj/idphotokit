// specs/documents.csv (with specs/countries.csv beside it) is turned into JavaScript at build
// time by scripts/specs.mjs (wired in vite.config.ts and scripts/prerender.mjs).
declare module "*/documents.csv" {
  const rows: import("./utils/presets").SheetRow[];
  export const countries: import("./utils/presets").Country[];
  export default rows;
}
