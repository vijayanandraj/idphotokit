import PhotoGuide from "./PhotoGuide";

/**
 * How to take the photo in the first place.
 *
 * The app can fix framing, background and size; it cannot fix a squint, a flash shadow or
 * a beauty filter. Those are what applications actually get rejected for, so the advice
 * belongs before the upload rather than in a FAQ nobody opens.
 *
 * Collapsed by default: it is reference material, and returning users should not have to
 * scroll past it every time.
 */

type Tip = { label: string; body: string };

const TIPS: Tip[] = [
  {
    label: "Light",
    body:
      "Stand facing a window in daylight. You want soft, even light on the whole face — no camera flash, no shadow under the eyes, no shadow cast on the wall behind you."
  },
  {
    label: "Camera",
    body:
      "Ask someone to take it with the rear camera, held at your eye level, about two arm-lengths away. A close selfie enlarges the nose and is the one distortion no crop can undo."
  },
  {
    label: "Face",
    body:
      "Look straight into the lens. Neutral expression, mouth closed, both eyes open and fully visible. A smile is refused by most authorities."
  },
  {
    label: "Head",
    body:
      "Square to the camera — not tilted, not turned. Push hair back off the eyes and eyebrows so the face is unobstructed from chin to hairline."
  },
  {
    label: "Glasses",
    body:
      "Take them off. The US and UK refuse photos with glasses outright, and elsewhere frames and lens glare over the eyes are a common rejection."
  },
  {
    label: "Headwear",
    body:
      "No hats or caps. A religious head covering is accepted as long as it leaves the full face visible from chin to forehead."
  },
  {
    label: "Clothing",
    body:
      "Everyday clothes, nothing that looks like a uniform. Avoid white and very pale tops — they merge into a white background and the shoulders disappear."
  },
  {
    label: "Recency",
    body:
      "Most countries want a photo from the last six months that still looks like you today."
  }
];

const AVOID = [
  "Filters and beauty or skin-smoothing modes",
  "Portrait mode — the blurred edge confuses the cutout",
  "Screenshots, or a photo of a printed photo",
  "A low-resolution crop out of a group picture"
];

type Props = {
  /** The document's background colour, for the example photo. */
  background?: string;
  /**
   * Checking a finished photo rather than making one: the background is not replaced, so it
   * counts too.
   */
  checking?: boolean;
  /** Start expanded. */
  open?: boolean;
};

export default function PhotoTips({ background, checking = false, open = false }: Props) {
  return (
    <details className="panel tipsPanel" open={open}>
      <summary className="panelHead">
        <span className="panelTitle">How to take a photo that passes</span>
        <span className="panelMeta">{TIPS.length} rules · 1 minute</span>
      </summary>

      <div className="panelBody">
        <p className="small tipsIntro">
          {checking
            ? "A photo that is already taken can only be re-cropped and given a new background. Everything else has to be right in the shot itself."
            : "Ignore the background — this tool removes it. Everything else has to be right in the shot itself."}
        </p>

        <PhotoGuide background={background} includeBackground={checking} />

        <div className="tipGrid">
          {TIPS.map(t => (
            <div key={t.label} className="tip">
              <div className="tipLabel mono">{t.label}</div>
              <div className="small">{t.body}</div>
            </div>
          ))}
        </div>

        <div className="tipAvoid">
          <div className="tipLabel mono">Never</div>
          <ul className="small tipAvoidList">
            {AVOID.map(a => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
