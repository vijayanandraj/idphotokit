/**
 * Writes one real static page per country, after `vite build`.
 *
 * Why this exists: the searches that bring people to a tool like this are not "passport
 * photo maker" — that term belongs to companies with ad budgets. They are "passport photo
 * size india", "us visa photo 2x2", "schengen visa photo background". Every one of those is
 * answered by data already in src/utils/presets.ts, and all 53 answers used to live behind a
 * query parameter on one client-rendered page, which Google cannot index as 53 pages.
 *
 * So each country gets its own path, its own title and description, and its own visible
 * requirements table — the same facts the app uses to frame the photo, written out where a
 * crawler and a reader can both see them. The app boots on top and preselects the country
 * from the path (see src/utils/route.ts).
 */

import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

/** Change this once, after pointing a real domain at the deployment. */
const SITE = process.env.SITE_URL?.replace(/\/+$/, "") || "https://passport-maker-ten.vercel.app";

const META_BLOCK = /<!-- meta:start[\s\S]*?<!-- meta:end -->/;
const DOC_SLOT = "<!-- country-doc -->";

/** presets.ts is TypeScript, so bundle it to something node can import. */
async function loadPresets() {
  const result = await build({
    stdin: {
      contents: `export { PRESETS, slugFor, backgroundsFor, backgroundLabel, headTargetFor, formatSize, DEFAULT_HEAD } from "./src/utils/presets";
                 export { sizeToPx } from "./src/utils/units";`,
      resolveDir: root,
      loader: "ts"
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false
  });

  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Chin-to-crown in millimetres, which is how authorities publish the requirement. */
function headMmRange(preset, lib) {
  const range = preset.head ?? lib.DEFAULT_HEAD;
  const heightMm = preset.unit === "in" ? preset.height * 25.4 : preset.unit === "cm" ? preset.height * 10 : preset.height;
  return {
    min: range.min * heightMm,
    max: range.max * heightMm,
    specified: !!preset.head
  };
}

function metaFor(preset, lib) {
  const size = lib.formatSize(preset);
  const url = `${SITE}/passport-photo/${lib.slugFor(preset)}`;
  const title = `${preset.name} passport photo size — ${size} | free maker, no sign-in`;
  const description =
    `${preset.name} passport and visa photos are ${size}. Make one free in your browser: ` +
    `automatic head sizing to the ${preset.name} rule, background removal, and a printable sheet. ` +
    `No sign-in and no upload — your photo never leaves your device.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: `${preset.name} Passport Photo Maker`,
    url,
    applicationCategory: "PhotographyApplication",
    operatingSystem: "Any browser",
    description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
  };

  return `<title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Passport Photo Maker" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${SITE}/og.png" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

/**
 * The visible reference section, below the app.
 *
 * It is the same data the tool runs on, written out for a reader — which is what makes the
 * page worth ranking rather than a doorway. Nothing here is hidden from users.
 */
function docFor(preset, lib, all) {
  const size = lib.formatSize(preset);
  const px = lib.sizeToPx(preset.width, preset.height, preset.unit, 300);
  const head = headMmRange(preset, lib);
  const backgrounds = lib.backgroundLabel(preset);

  const siblings = all
    .filter(p => p.id !== preset.id && p.region === preset.region)
    .slice(0, 8)
    .map(p => `<li><a href="/passport-photo/${lib.slugFor(p)}">${esc(p.name)} passport photo size</a></li>`)
    .join("");

  const headRow = head.specified
    ? `<tr><th scope="row">Head height (chin to crown)</th><td>${head.min.toFixed(0)}–${head.max.toFixed(0)} mm</td></tr>`
    : `<tr><th scope="row">Head height (chin to crown)</th><td>${head.min.toFixed(0)}–${head.max.toFixed(0)} mm (ICAO guidance — ${esc(preset.name)} publishes no figure)</td></tr>`;

  return `<section class="countryDoc">
      <div class="countryDocInner">
        <h2>${esc(preset.name)} passport photo requirements</h2>
        <p>
          A ${esc(preset.name)} passport or visa photo is <strong>${esc(size)}</strong>
          (${px.w} × ${px.h} pixels at 300 DPI) on a ${esc(backgrounds.toLowerCase())}
          background. ${head.specified
            ? `The head must measure ${head.min.toFixed(0)}–${head.max.toFixed(0)} mm from chin to crown`
            : `No chin-to-crown figure is published, so the ICAO proportion of ${head.min.toFixed(0)}–${head.max.toFixed(0)} mm is used`},
          which is the part most photo tools ignore — a photo can be exactly the right size
          and still be rejected for a head that fills too much or too little of the frame.
        </p>

        <table class="specTable">
          <caption>${esc(preset.name)} photo specification</caption>
          <tbody>
            <tr><th scope="row">Photo size</th><td>${esc(size)}</td></tr>
            <tr><th scope="row">At 300 DPI</th><td>${px.w} × ${px.h} pixels</td></tr>
            ${headRow}
            <tr><th scope="row">Background</th><td>${esc(backgrounds)}</td></tr>
            <tr><th scope="row">Expression</th><td>Neutral, mouth closed, both eyes open and visible</td></tr>
            ${preset.note ? `<tr><th scope="row">Notes</th><td>${esc(preset.note)}</td></tr>` : ""}
          </tbody>
        </table>

        <h3>How to make one</h3>
        <ol>
          <li>Choose a well-lit, front-facing photo of yourself — a phone photo is fine.</li>
          <li>The head is measured and framed to the ${esc(preset.name)} rule automatically.</li>
          <li>The background is replaced with ${esc(backgrounds.toLowerCase())} by a matting model.</li>
          <li>Download one photo for an online application, or a print sheet with cut lines.</li>
        </ol>

        <h3>Is my photo uploaded anywhere?</h3>
        <p>
          No. There is no server to upload it to — the cropping, face detection and
          background removal all run inside this browser tab, and nothing is stored. Turn
          off your Wi-Fi once the page has loaded and it still works.
        </p>

        ${siblings ? `<h3>Other ${esc(preset.region)} requirements</h3><ul class="countryLinks">${siblings}</ul>` : ""}

        <p class="countryDocNote">
          Requirements change, and the issuing authority's own guidance is always the
          authority. These figures are transcriptions of published requirements, offered as
          a convenience and not as legal advice.
        </p>
      </div>
    </section>`;
}

function sitemap(presets, lib) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE}/`, priority: "1.0" },
    ...presets.map(p => ({ loc: `${SITE}/passport-photo/${lib.slugFor(p)}`, priority: "0.8" }))
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(u => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`)
  .join("\n")}
</urlset>
`;
}

async function main() {
  const lib = await loadPresets();
  const { PRESETS } = lib;

  const shell = await readFile(join(dist, "index.html"), "utf8");
  if (!META_BLOCK.test(shell)) throw new Error("index.html has no meta:start/meta:end block to replace");
  if (!shell.includes(DOC_SLOT)) throw new Error(`index.html has no ${DOC_SLOT} slot`);

  for (const preset of PRESETS) {
    const html = shell
      .replace(META_BLOCK, metaFor(preset, lib))
      .replace(DOC_SLOT, docFor(preset, lib, PRESETS));

    // Written twice on purpose. Static hosts disagree about which file answers a URL with
    // no trailing slash — the form the canonical tag, the sitemap and every inbound link
    // use. Vercel's cleanUrls serves <slug>.html there; others resolve <slug>/index.html.
    // Both files are identical and both carry the same canonical URL, so whichever the host
    // picks, crawlers are pointed at one address.
    const slug = lib.slugFor(preset);
    const dir = join(dist, "passport-photo", slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), html, "utf8");
    await writeFile(join(dist, "passport-photo", `${slug}.html`), html, "utf8");
  }

  // The homepage keeps its default meta; it just doesn't need the empty slot.
  await writeFile(join(dist, "index.html"), shell.replace(DOC_SLOT, ""), "utf8");
  await writeFile(join(dist, "sitemap.xml"), sitemap(PRESETS, lib), "utf8");

  console.log(`prerendered ${PRESETS.length} country pages + sitemap.xml (site: ${SITE})`);
}

await main();
