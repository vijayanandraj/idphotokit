import { TAGLINE, TAGLINE_PROMISE } from "../../brand";
import {
  ANY_COUNTRY,
  backgroundLabel,
  documentLabel,
  DEFAULT_HEAD,
  formatFileKB,
  formatSize,
  PRESETS,
  PRIMARY_PRESETS,
  presetTitle,
  type Preset
} from "../../utils/presets";
import { presetFromPath } from "../../utils/route";

type Tile = { value: string; label: string };

/** The kinds of document covered, as a reader would name them. */
const KINDS = ["Passports", "Visas", "Residence permits", "ID cards", "Driving licences", "Student cards", "Licences"];

/**
 * The top of step 1.
 *
 * The homepage speaks to every document, not just passports, and leads with the promise
 * that sets the tool apart: the photo is never uploaded. A document's own page
 * (/photo/india/pan-card) is where a search for that document lands, so there the headline
 * names it and the tiles give its spec at a glance — with the same promise underneath.
 */
export default function Hero({ preset }: { preset?: Preset }) {
  // The path decides the voice, the store decides the numbers — so switching document on a
  // document page updates the headline with it.
  const onDocPage = !!presetFromPath();
  const doc = onDocPage ? preset : undefined;

  if (doc) {
    const head = doc.head ?? DEFAULT_HEAD;
    const tiles: Tile[] = [
      { value: formatSize(doc), label: doc.digitalOnly ? "upload size" : "print size" },
      {
        value: head.target !== undefined
          ? `${Math.round(head.target * 100)}%`
          : `${Math.round(head.min * 100)}–${Math.round(head.max * 100)}%`,
        label: "head height"
      },
      { value: backgroundLabel(doc), label: "background" }
    ];
    if (doc.fileKB) tiles.push({ value: formatFileKB(doc.fileKB), label: "file size" });

    return (
      <section className="hero">
        <div className="heroEyebrow mono">
          {doc.country === ANY_COUNTRY ? "Standard size" : doc.name} · {documentLabel(doc)}
        </div>
        <h1 className="heroTitle">
          {presetTitle(doc)} photo.
          <span className="heroPromise">Privacy first. {TAGLINE_PROMISE}</span>
        </h1>
        <p className="heroSub">
          Made right here in your browser: framed to the {doc.country === ANY_COUNTRY ? "" : `${doc.name} `}rule for this document,
          background replaced, and every measurement checked before you{" "}
          {doc.digitalOnly ? "upload it" : "print or upload it"}. Free, and no account.
        </p>
        <Tiles tiles={tiles} />
      </section>
    );
  }

  return (
    <section className="hero">
      <div className="heroEyebrow mono" aria-label="Documents covered">
        {KINDS.join(" · ")}
      </div>
      <h1 className="heroTitle">
        {TAGLINE}
        <span className="heroPromise">{TAGLINE_PROMISE}</span>
      </h1>
      <p className="heroSub">
        Your photo is framed, cleaned up and checked inside this browser tab — it is never sent
        to a server, so there is nothing to leak and nothing to delete later. And every
        document's own rules are built in: the size, how much of the frame your head fills,
        where your eyes sit, the background colour, even the file size an upload form will take.
      </p>
      <Tiles
        tiles={[
          { value: String(PRESETS.length), label: "documents" },
          { value: String(PRIMARY_PRESETS.filter(p => p.country !== ANY_COUNTRY).length), label: "countries" },
          { value: "0", label: "photos uploaded" },
          { value: "Free", label: "no account, no watermark" }
        ]}
      />
    </section>
  );
}

function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <dl className="heroTiles">
      {tiles.map(t => (
        <div key={t.label} className="heroTile">
          <dt>{t.label}</dt>
          <dd className="mono">{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}
