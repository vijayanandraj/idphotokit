/**
 * Writes one real static page per document, after `vite build`.
 *
 * Why this exists: the searches that bring people to a tool like this are not "passport
 * photo maker" — that term belongs to companies with ad budgets. They are "passport photo
 * size india", "us visa photo 2x2", "pan card photo size", "dv lottery photo". Every one of
 * those is answered by data already in src/utils/presets.ts, and a query parameter on one
 * client-rendered page cannot be indexed as a page per answer.
 *
 * So each document gets its own path — /photo/<country> for a country's primary document,
 * /photo/<country>/<document> for the rest — its own title and description, and its own
 * visible requirements table and diagram: the same facts the app uses to frame the photo,
 * written out where a crawler and a reader can both see them. The app boots on top and
 * preselects the document from the path (see src/utils/route.ts).
 */

import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { specsModule } from "./specs.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

/** Change this once, after pointing a real domain at the deployment. */
const SITE = process.env.SITE_URL?.replace(/\/+$/, "") || "https://idphotokit-ashy.vercel.app";

const META_BLOCK = /<!-- meta:start[\s\S]*?<!-- meta:end -->/;
const DOC_SLOT = "<!-- country-doc -->";

/** presets.ts is TypeScript, so bundle it to something node can import. */
async function loadPresets() {
  const result = await build({
    stdin: {
      contents: `export { PRESETS, ANY_COUNTRY, slugsFor, documentsFor, documentsByCategory, documentLabel, presetTitle, backgroundsFor, backgroundLabel, formatSize, formatFileKB, sourceLabels, samePhotoAs, DEFAULT_HEAD } from "./src/utils/presets";
                 export { sizeToPx, toInches } from "./src/utils/units";
                 export { BRAND, TAGLINE, HOME_DESCRIPTION } from "./src/brand";`,
      resolveDir: root,
      loader: "ts"
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    // The same reader the app's build uses (vite.config.ts), so pages match the app.
    plugins: [{
      name: "specs-sheet",
      setup(b) {
        b.onLoad({ filter: /documents\.csv$/ }, async args => ({
          contents: specsModule(
            await readFile(args.path, "utf8"),
            await readFile(join(dirname(args.path), "countries.csv"), "utf8")
          ),
          loader: "js"
        }));
      }
    }]
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

const pathFor = (preset, lib) => `/photo/${lib.slugsFor(preset).join("/")}`;

/** A fraction of the photo height, in the document's own terms: mm for a print, px for an upload. */
function lengthOf(fraction, preset, lib) {
  if (preset.unit === "px") return `${Math.round(fraction * preset.height)}`;
  const mm = lib.toInches(fraction * preset.height, preset.unit) * 25.4;
  return mm.toFixed(mm < 10 ? 1 : 0);
}
const unitOf = (preset) => (preset.unit === "px" ? "px" : "mm");
const pct = (f) => Math.round(f * 100);

function rangeText(r, preset, lib) {
  if (r.target !== undefined) {
    return `${lengthOf(r.target, preset, lib)} ${unitOf(preset)} (${pct(r.target)}% of the height)`;
  }
  return `${lengthOf(r.min, preset, lib)}–${lengthOf(r.max, preset, lib)} ${unitOf(preset)} (${pct(r.min)}–${pct(r.max)}% of the height)`;
}

function metaFor(preset, lib) {
  const size = lib.formatSize(preset);
  const title = lib.presetTitle(preset);
  const url = `${SITE}${pathFor(preset, lib)}`;
  const pageTitle = `${title} photo size — ${size} | ${lib.BRAND}`;
  const limit = preset.fileKB ? `, ${lib.formatFileKB(preset.fileKB)}` : "";
  const description =
    `${title} photos are ${size}${limit}. Make one free in your browser: ` +
    `automatic head sizing to ${preset.country === lib.ANY_COUNTRY ? "standard ID proportions" : `the ${preset.name} rule`}, background removal, and ` +
    `${preset.digitalOnly ? "a JPEG sized for the upload form" : "a printable sheet"}. ` +
    `No sign-in and no upload — your photo never leaves your device.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: `${title} Photo Maker`,
    url,
    applicationCategory: "PhotographyApplication",
    operatingSystem: "Any browser",
    description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
  };

  return metaBlock({ title: pageTitle, description, url, jsonLd }, lib);
}

/** Title, description, canonical, Open Graph, Twitter and JSON-LD for one page. */
function metaBlock({ title, description, url, jsonLd }, lib) {
  return `<title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(lib.BRAND)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(`${lib.BRAND} — a photo framed to its document's head-height rule, with the measurements marked.`)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${SITE}/og.png" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

/** The homepage speaks to every document, so its meta comes from brand.ts rather than a preset. */
function homeMeta(lib) {
  const title = `${lib.BRAND} — passport, visa and ID photos, free and private`;
  return metaBlock(
    {
      title,
      description: lib.HOME_DESCRIPTION,
      url: `${SITE}/`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: lib.BRAND,
        url: `${SITE}/`,
        applicationCategory: "PhotographyApplication",
        operatingSystem: "Any browser",
        description: lib.HOME_DESCRIPTION,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
      }
    },
    lib
  );
}

/**
 * The requirement drawn the way a requirements sheet draws it: the frame with its width and
 * height, a figure framed to the middle of the allowed head range, and the published bands
 * marked beside it. Same numbers as the table, in a form that can be checked at a glance.
 */
function diagramFor(preset, lib) {
  const PH = 300;
  const PW = PH * (preset.width / preset.height);
  const L = 60, T = 14, R = 150, B = 52;
  const W = L + PW + R, H = T + PH + B;
  const x0 = L, y0 = T, xR = L + PW, yB = T + PH;
  const Y = (f) => y0 + f * PH;

  const head = preset.head ?? lib.DEFAULT_HEAD;
  const target = head.target ?? (head.min + head.max) / 2;
  const gap = preset.crownGap ?? (1 - target) * 0.32;
  const crown = Y(gap);
  const chin = Y(gap + target);
  const headH = chin - crown;
  const cx = x0 + PW / 2;
  const bg = lib.backgroundsFor(preset)[0].color;
  const u = preset.unit === "px" ? "px" : preset.unit;

  const arrow = (x, y, dx, dy) => {
    const s = 6, h = 2.7;
    return `M${x} ${y} L${x - dx * s - dy * h} ${y - dy * s + dx * h} L${x - dx * s + dy * h} ${y - dy * s - dx * h} Z`;
  };
  const vdim = (x, ya, yb, label, color, side = 1) => {
    const my = (ya + yb) / 2, tx = x + side * 11;
    return `<g stroke="${color}" fill="${color}">
      <line x1="${x}" y1="${ya}" x2="${x}" y2="${yb}" stroke-width="1.2"/>
      <line x1="${x - 5}" y1="${ya}" x2="${x + 5}" y2="${ya}"/><line x1="${x - 5}" y1="${yb}" x2="${x + 5}" y2="${yb}"/>
      ${yb - ya > 14 ? `<path stroke="none" d="${arrow(x, ya, 0, -1)}"/><path stroke="none" d="${arrow(x, yb, 0, 1)}"/>` : ""}
      <text x="${tx}" y="${my}" stroke="none" font-size="17" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${tx} ${my})">${esc(label)}</text>
    </g>`;
  };

  // A neutral head-and-shoulders figure scaled to the target head height.
  const rx = headH * 0.36, ry = headH * 0.5;
  const neckY = chin - headH * 0.04;
  const shoulderW = Math.min(PW * 0.48, headH * 1.05);
  const figure = `<g fill="#9aa3ae">
      <ellipse cx="${cx}" cy="${crown + ry}" rx="${rx}" ry="${ry}"/>
      <path d="M${cx - rx * 0.42} ${neckY} L${cx + rx * 0.42} ${neckY} L${cx + rx * 0.5} ${chin + headH * 0.14}
        Q${cx + shoulderW} ${chin + headH * 0.2} ${cx + shoulderW} ${yB} L${cx - shoulderW} ${yB}
        Q${cx - shoulderW} ${chin + headH * 0.2} ${cx - rx * 0.5} ${chin + headH * 0.14} Z"/>
    </g>`;

  const c1 = xR + 24, c2 = xR + 64;
  const parts = [
    `<defs><clipPath id="frame"><rect x="${x0}" y="${y0}" width="${PW}" height="${PH}"/></clipPath></defs>`,
    `<rect x="${x0}" y="${y0}" width="${PW}" height="${PH}" fill="${bg}"/>`,
    `<g clip-path="url(#frame)">${figure}</g>`,
    `<rect x="${x0}" y="${y0}" width="${PW}" height="${PH}" fill="none" stroke="#14171c" stroke-opacity=".35"/>`,
    vdim(x0 - 24, y0, yB, `${+preset.height.toFixed(2)} ${u}`, "#14171c", -1),
    `<g stroke="#14171c" fill="#14171c">
      <line x1="${x0}" y1="${yB + 18}" x2="${xR}" y2="${yB + 18}" stroke-width="1.2"/>
      <path stroke="none" d="${arrow(x0, yB + 18, -1, 0)}"/><path stroke="none" d="${arrow(xR, yB + 18, 1, 0)}"/>
      <text x="${(x0 + xR) / 2}" y="${yB + 42}" stroke="none" font-size="17" text-anchor="middle">${esc(`${+preset.width.toFixed(2)} ${u}`)}</text>
    </g>`,
    `<g stroke="#14171c" stroke-opacity=".4" stroke-dasharray="3 3">
      <line x1="${cx}" y1="${crown}" x2="${c1 + 6}" y2="${crown}"/>
      <line x1="${cx}" y1="${chin}" x2="${c1 + 6}" y2="${chin}"/>
    </g>`,
    // The allowed chin band, given the crown where it is.
    `<rect x="${c1 - 5}" y="${crown + head.min * PH}" width="10" height="${(head.max - head.min) * PH}" fill="#3f7a5d" fill-opacity=".22"/>`,
    vdim(c1, crown, chin, head.target !== undefined ? `head ${pct(head.target)}%` : `head ${pct(head.min)}–${pct(head.max)}%`, "#3f7a5d"),
    vdim(c1, y0, crown, preset.crownGap !== undefined ? `${pct(gap)}%` : "", "#5b6470")
  ];

  if (preset.eyeLine) {
    const e = preset.eyeLine.target ?? (preset.eyeLine.min + preset.eyeLine.max) / 2;
    const ey = Y(1 - e);
    parts.push(
      `<rect x="${c2 - 5}" y="${Y(1 - preset.eyeLine.max)}" width="10" height="${(preset.eyeLine.max - preset.eyeLine.min) * PH}" fill="#3f7a5d" fill-opacity=".22"/>`,
      `<line x1="${x0}" y1="${ey}" x2="${c2 + 6}" y2="${ey}" stroke="#3f7a5d" stroke-opacity=".7" stroke-dasharray="6 4"/>`,
      vdim(c2, ey, yB, preset.eyeLine.target !== undefined ? `eyes ${pct(e)}%` : `eyes ${pct(preset.eyeLine.min)}–${pct(preset.eyeLine.max)}%`, "#3f7a5d")
    );
  }

  return `<figure class="specDiagram">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${lib.presetTitle(preset)} photo: ${lib.formatSize(preset)}, head ${pct(head.min)}–${pct(head.max)}% of the height`)}" font-family="IBM Plex Mono, ui-monospace, monospace">
        ${parts.join("\n        ")}
      </svg>
      <figcaption>Head height and position are drawn to the published figure. The shaded band is the tolerance the photo is checked within.</figcaption>
    </figure>`;
}

/**
 * The visible reference section, below the app.
 *
 * It is the same data the tool runs on, written out for a reader — which is what makes the
 * page worth ranking rather than a doorway. Nothing here is hidden from users.
 */
function docFor(preset, lib, all) {
  const title = lib.presetTitle(preset);
  const size = lib.formatSize(preset);
  const px = lib.sizeToPx(preset.width, preset.height, preset.unit, 300);
  const head = preset.head ?? lib.DEFAULT_HEAD;
  const backgrounds = lib.backgroundLabel(preset);

  // The rest of the country's documents, grouped as the picker groups them.
  const sameCountry = lib
    .documentsByCategory(preset.country)
    .map(g => ({ ...g, documents: g.documents.filter(p => p.id !== preset.id) }))
    .filter(g => g.documents.length > 0)
    .map(g => `<h4>${esc(g.category)}</h4><ul class="countryLinks">${g.documents
      .map(p => `<li><a href="${pathFor(p, lib)}">${esc(lib.presetTitle(p))} photo</a> — ${esc(lib.formatSize(p))}</li>`)
      .join("")}</ul>`)
    .join("");
  const samePhoto = lib.samePhotoAs(preset);

  const siblings = all
    .filter(p => p.primary && p.country !== preset.country && p.region === preset.region && p.region !== "Worldwide")
    .slice(0, 8)
    .map(p => `<li><a href="${pathFor(p, lib)}">${esc(lib.presetTitle(p))} photo size</a></li>`)
    .join("");

  const rows = [
    ["Photo size", esc(size)],
    preset.unit !== "px" ? ["At 300 DPI", `${px.w} × ${px.h} pixels`] : null,
    [
      "Head height (chin to crown)",
      esc(rangeText(head, preset, lib)) + (preset.head ? "" : " — ICAO guidance, no figure is published")
    ],
    preset.crownGap !== undefined
      ? ["Top of photo to top of hair", `about ${lengthOf(preset.crownGap, preset, lib)} ${unitOf(preset)} (${pct(preset.crownGap)}%)`]
      : null,
    preset.eyeLine ? ["Eye line, up from the bottom", esc(rangeText(preset.eyeLine, preset, lib))] : null,
    ["Background", esc(backgrounds)],
    preset.fileKB ? ["File size", `${esc(lib.formatFileKB(preset.fileKB))}, JPEG`] : null,
    ["Use", preset.digitalOnly ? "Online upload only" : "Print, or upload where the form accepts it"],
    ["Expression", "Neutral, mouth closed, both eyes open and visible"],
    preset.note ? ["Notes", esc(preset.note)] : null,
    samePhoto.length
      ? ["Same photo works for", samePhoto.map(p => `<a href="${pathFor(p, lib)}">${esc(lib.documentLabel(p))}</a>`).join(", ")]
      : null,
    preset.sources
      ? [
          preset.sources.length > 1 ? "Official sources" : "Official source",
          lib.sourceLabels(preset.sources)
            .map(({ url, label }) => `<a href="${esc(url)}" rel="nofollow noopener" target="_blank">${esc(label)}</a>`)
            .join(" · ")
        ]
      : null
  ].filter(Boolean);

  return `<section class="countryDoc">
      <div class="countryDocInner">
        <h2>${esc(title)} photo requirements</h2>
        <p>
          A ${esc(title)} photo is <strong>${esc(size)}</strong>${preset.unit !== "px" ? ` (${px.w} × ${px.h} pixels at 300 DPI)` : ""}
          on a ${esc(backgrounds.toLowerCase())} background${preset.fileKB ? `, saved as a JPEG ${esc(lib.formatFileKB(preset.fileKB))}` : ""}.
          ${preset.head
            ? `The head must measure ${esc(rangeText(head, preset, lib))} from chin to crown`
            : `No chin-to-crown figure is published, so the ICAO proportion of ${esc(rangeText(head, preset, lib))} is used`},
          which is the part most photo tools ignore — a photo can be exactly the right size
          and still be rejected for a head that fills too much or too little of the frame.
        </p>

        <div class="specLayout">
          ${diagramFor(preset, lib)}
          <table class="specTable">
            <caption>${esc(title)} photo specification</caption>
            <tbody>
              ${rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("\n              ")}
            </tbody>
          </table>
        </div>

        <h3>How to make one</h3>
        <ol>
          <li>Choose a well-lit, front-facing photo of yourself — a phone photo is fine.</li>
          <li>The head is measured and framed to the ${esc(title)} rule automatically.</li>
          <li>The background is replaced with ${esc(backgrounds.toLowerCase())} by a matting model.</li>
          <li>${preset.digitalOnly
            ? `Download a JPEG at exactly ${esc(size)}${preset.fileKB ? `, compressed to ${esc(lib.formatFileKB(preset.fileKB))}` : ""}, ready to upload.`
            : "Download one photo for an online application, or a print sheet with cut lines."}</li>
        </ol>

        <h3>Is my photo uploaded anywhere?</h3>
        <p>
          No. There is no server to upload it to — the cropping, face detection and
          background removal all run inside this browser tab, and nothing is stored. Turn
          off your Wi-Fi once the page has loaded and it still works.
        </p>

        ${sameCountry ? `<h3>Other ${esc(preset.country === lib.ANY_COUNTRY ? "standard sizes" : `${preset.name} documents`)}</h3>${sameCountry}` : ""}
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
    ...presets.map(p => ({ loc: `${SITE}${pathFor(p, lib)}`, priority: p.primary ? "0.8" : "0.7" }))
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
    // use. Vercel's cleanUrls and Cloudflare Pages serve <path>.html there; others resolve
    // <path>/index.html. Both files are identical and both carry the same canonical URL, so
    // whichever the host picks, crawlers are pointed at one address.
    const path = pathFor(preset, lib).slice(1);
    const dir = join(dist, path);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), html, "utf8");
    await writeFile(join(dist, `${path}.html`), html, "utf8");
  }

  // The homepage gets the brand's own meta, and doesn't need the empty slot.
  await writeFile(join(dist, "index.html"), shell.replace(META_BLOCK, homeMeta(lib)).replace(DOC_SLOT, ""), "utf8");
  await writeFile(join(dist, "sitemap.xml"), sitemap(PRESETS, lib), "utf8");

  const countries = PRESETS.filter(p => p.primary && p.country !== lib.ANY_COUNTRY).length;
  console.log(`prerendered ${PRESETS.length} document pages for ${countries} countries + sitemap.xml (site: ${SITE})`);
}

await main();
