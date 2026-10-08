import { useId, type ReactNode } from "react";

/**
 * The photo rules as pictures: one photo that passes, the mistakes that get photos refused,
 * and how to set up the shot.
 *
 * Drawn rather than photographed: the same face in every frame, so the only thing that
 * changes between "passes" and "refused" is the one mistake being shown. Inline SVG, so it
 * costs nothing to download and stays sharp on any screen.
 */

const SKIN = "#d9a47e";
const SKIN_EDGE = "#b98563";
const HAIR = "#2b2220";
const SHIRT = "#3d4d6a";
const INK = "#2a2420";

type Pose = {
  /** Degrees, positive leans the head towards the right of the picture. */
  tilt?: number;
  /** Turned towards the right of the picture. */
  turned?: boolean;
  mouth?: "neutral" | "smile" | "open";
  eyesClosed?: boolean;
  glasses?: boolean;
  /** Side light: one half of the face in shadow, and the head's shadow on the wall. */
  shadow?: boolean;
  hairOverEyes?: boolean;
  hat?: boolean;
  /** 1 is correct framing; below is too far away, above too close. */
  zoom?: number;
  busy?: boolean;
  /** Dashed crown, eye and chin lines. */
  guides?: boolean;
};

function Face({ p }: { p: Pose }) {
  const clip = "face" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const dx = p.turned ? 7 : 0;
  const eye = (cx: number) =>
    p.eyesClosed ? (
      <path d={`M${cx - 4} 62 Q${cx} 65 ${cx + 4} 62`} stroke={INK} strokeWidth="1.2" fill="none" />
    ) : (
      <g>
        <ellipse cx={cx} cy={62} rx={4} ry={2.4} fill="#fff" />
        <circle cx={cx + (p.turned ? 1.4 : 0)} cy={62} r={1.7} fill={INK} />
      </g>
    );

  return (
    <g transform={`rotate(${p.tilt ?? 0} 60 100)`}>
      {/* Ears: the far one disappears when the head turns. */}
      {!p.turned && <ellipse cx={86} cy={67} rx={4} ry={7} fill={SKIN} stroke={SKIN_EDGE} strokeWidth="0.6" />}
      <ellipse cx={p.turned ? 37 : 34} cy={67} rx={4} ry={7} fill={SKIN} stroke={SKIN_EDGE} strokeWidth="0.6" />
      <ellipse cx={60} cy={66} rx={p.turned ? 24 : 26} ry={34} fill={SKIN} stroke={SKIN_EDGE} strokeWidth="0.6" />

      {p.shadow && (
        <>
          <clipPath id={clip}>
            <ellipse cx={60} cy={66} rx={26} ry={34} />
          </clipPath>
          <rect x={60} y={30} width={30} height={72} fill="#3a2a22" opacity="0.38" clipPath={`url(#${clip})`} />
        </>
      )}

      <path
        d="M34 62 Q31 27 60 26 Q89 27 86 62 Q85 44 75 39 Q61 46 46 39 Q36 45 34 62 Z"
        fill={HAIR}
      />

      <g transform={`translate(${dx} 0)`}>
        <path d="M45 55 Q50 52.5 55 55" stroke={HAIR} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M65 55 Q70 52.5 75 55" stroke={HAIR} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {eye(50)}
        {eye(70)}
        <path
          d={p.turned ? "M62 64 L66 76 Q63 78.5 59 77" : "M60 64 L57 76 Q60 78 63 76"}
          stroke={SKIN_EDGE}
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />
        {(p.mouth ?? "neutral") === "neutral" && (
          <path d="M53 86 Q60 87.2 67 86" stroke="#8c4a3e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        )}
        {p.mouth === "smile" && (
          <path d="M50 83 Q60 95 70 83 Q60 86 50 83 Z" fill="#fff" stroke="#8c4a3e" strokeWidth="1.3" />
        )}
        {p.mouth === "open" && <ellipse cx={60} cy={87} rx={4.5} ry={5.5} fill="#5a2a24" />}

        {p.glasses && (
          <g fill="none" stroke={INK} strokeWidth="1.4">
            <rect x={42} y={56} width={16} height={12} rx={4} fill="rgba(200,225,255,0.25)" />
            <rect x={62} y={56} width={16} height={12} rx={4} fill="rgba(200,225,255,0.25)" />
            <path d="M58 61 Q60 59 62 61" />
            <path d="M44.5 65.5 L50 58" stroke="#fff" strokeWidth="2.2" opacity="0.95" />
            <path d="M64.5 65.5 L70 58" stroke="#fff" strokeWidth="2.2" opacity="0.95" />
          </g>
        )}
      </g>

      {p.hairOverEyes && (
        <path d="M34 60 Q36 32 62 31 Q84 32 86 50 Q76 46 70 52 Q62 66 46 66 Q38 66 34 60 Z" fill={HAIR} />
      )}

      {p.hat && (
        <g fill="#7a3b2e">
          <path d="M32 47 Q32 15 60 15 Q88 15 88 47 Z" />
          <path d="M30 47 L104 47 Q104 52 96 52 L30 52 Z" fill="#5e2c22" />
        </g>
      )}
    </g>
  );
}

function BusyWall() {
  return (
    <g>
      <rect width={120} height={150} fill="#cdb79a" />
      <rect x={6} y={10} width={38} height={46} fill="#9fc3df" stroke="#fff" strokeWidth="2" />
      <path d="M25 10 V56 M6 33 H44" stroke="#fff" strokeWidth="1.5" />
      <rect x={78} y={8} width={38} height={60} fill="#6d4c35" />
      {[0, 1, 2].map(row =>
        ["#b2473b", "#e0b24a", "#3f7a5d", "#294f86", "#8d5a9e"].map((c, i) => (
          <rect key={`${row}-${i}`} x={81 + i * 6.8} y={11 + row * 19} width={5.5} height={16} fill={c} />
        ))
      )}
      <circle cx={14} cy={112} r={14} fill="#4d8b4f" />
      <circle cx={24} cy={98} r={11} fill="#5fa060" />
    </g>
  );
}

/** One head-and-shoulders photo, framed the way a passport photo is. */
export function Portrait({ pose = {}, background = "#f4f4f1", title }: { pose?: Pose; background?: string; title: string }) {
  const z = pose.zoom ?? 1;
  // Zoom about the face, so "too close" crops the crown and chin off and "too far" shrinks
  // the head into the middle of the frame.
  const zoom = z === 1 ? undefined : `translate(60 ${z > 1 ? 66 : 112}) scale(${z}) translate(-60 ${z > 1 ? -66 : -112})`;

  return (
    <svg viewBox="0 0 120 150" role="img" aria-label={title} className="guidePortrait">
      <title>{title}</title>
      {pose.busy ? <BusyWall /> : <rect width={120} height={150} fill={background} />}
      {pose.shadow && <ellipse cx={90} cy={70} rx={30} ry={42} fill="#000" opacity="0.13" />}

      <g transform={zoom}>
        <path d="M6 150 Q8 122 36 116 L84 116 Q112 122 114 150 Z" fill={SHIRT} />
        <rect x={50} y={92} width={20} height={27} fill={SKIN} />
        <path d="M50 116 L60 126 L70 116" fill="none" stroke="#2c3850" strokeWidth="1.5" />
        <Face p={pose} />
      </g>

      {pose.guides && (
        <g stroke="var(--good)" strokeWidth="0.7" strokeDasharray="2.5 2" fill="none">
          <path d="M14 26 H106" />
          <path d="M14 62 H106" />
          <path d="M14 100 H106" />
          <path d="M60 4 V146" strokeDasharray="1 2.5" />
          <path d="M9 26 V100 M7 26 H11 M7 100 H11" strokeDasharray="none" />
        </g>
      )}
    </svg>
  );
}

/** Side view of the shot: window light on the face, camera at eye level, a step off the wall. */
export function SetupDiagram() {
  const label = (x: number, y: number, text: string, anchor: "start" | "middle" | "end" = "middle") => (
    <text x={x} y={y} textAnchor={anchor} fontSize="8.5" fill="var(--muted)">{text}</text>
  );

  return (
    <svg viewBox="0 0 340 160" role="img" aria-label="How to set up the shot" className="guideSetup">
      <title>Face a window, camera at eye level about 1.5 metres away, half a metre from a plain wall</title>
      <path d="M0 140 H340" stroke="var(--line-strong)" strokeWidth="1" />

      {/* Window, and its light falling on the face. */}
      <rect x={8} y={24} width={18} height={70} fill="#dcecf8" stroke="#8aa7bf" strokeWidth="1.5" />
      <path d="M17 24 V94 M8 59 H26" stroke="#8aa7bf" strokeWidth="1" />
      <g stroke="var(--gold)" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.9">
        <path d="M28 40 L238 44" />
        <path d="M28 60 L238 52" />
        <path d="M28 78 L238 60" />
      </g>
      {label(4, 108, "Window,", "start")}
      {label(4, 118, "soft daylight", "start")}

      {/* Camera on a stand, lens at eye height. */}
      <rect x={112} y={38} width={9} height={15} rx={1.5} fill="var(--ink)" />
      <path d="M116.5 53 V108 M116.5 108 L104 140 M116.5 108 L129 140 M116.5 108 V140" stroke="var(--ink)" strokeWidth="1.3" fill="none" />
      {label(116, 30, "Camera at eye level")}
      <path d="M121 45 L226 45" stroke="var(--good)" strokeWidth="0.9" strokeDasharray="2 2" />

      {/* Person, side on, facing the camera. */}
      <circle cx={238} cy={45} r={12} fill={SKIN} stroke={SKIN_EDGE} />
      <path d="M232 36 Q240 29 249 38 Q250 50 246 54 Q246 42 238 38 Z" fill={HAIR} />
      <circle cx={230} cy={43} r={1.2} fill={INK} />
      <path d="M232 58 Q238 56 246 58 L250 100 L226 100 Z" fill={SHIRT} />
      <path d="M229 100 L229 140 M245 100 L245 140" stroke={SHIRT} strokeWidth="6" />

      {/* Plain wall behind. */}
      <rect x={296} y={8} width={10} height={132} fill="#ecebe6" stroke="var(--line-strong)" strokeWidth="1" />
      {label(301, 152, "Plain wall")}

      {/* Distances. */}
      <g stroke="var(--navy)" strokeWidth="1" fill="var(--navy)">
        <path d="M120 124 H224" />
        <path d="M120 124 l5 -3 v6 Z M224 124 l-5 -3 v6 Z" />
        <path d="M252 124 H294" />
        <path d="M252 124 l5 -3 v6 Z M294 124 l-5 -3 v6 Z" />
      </g>
      <text x={172} y={118} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--navy)">about 1.5 m</text>
      <text x={273} y={118} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--navy)">½ m</text>
      {label(172, 154, "someone else takes it — not a selfie")}
    </svg>
  );
}

type Example = { title: string; why: string; pose: Pose; checkOnly?: boolean };

const MISTAKES: Example[] = [
  { title: "Head tilted", why: "Keep the eyes level.", pose: { tilt: 16 } },
  { title: "Turned away", why: "Face the lens square on.", pose: { turned: true } },
  { title: "Smiling", why: "Neutral, mouth closed.", pose: { mouth: "smile" } },
  { title: "Mouth open", why: "Lips together.", pose: { mouth: "open" } },
  { title: "Eyes closed", why: "Both eyes open, looking in.", pose: { eyesClosed: true } },
  { title: "Glasses and glare", why: "Take glasses off.", pose: { glasses: true } },
  { title: "Shadow on the face", why: "Face the window, no flash.", pose: { shadow: true } },
  { title: "Hair over the eyes", why: "Eyes and brows visible.", pose: { hairOverEyes: true } },
  { title: "Hat or cap", why: "Religious covering only.", pose: { hat: true } },
  { title: "Too far away", why: "Head too small to crop.", pose: { zoom: 0.55 } },
  { title: "Too close", why: "Leave space around the head.", pose: { zoom: 1.5 } },
  { title: "Busy background", why: "Stand in front of a plain wall.", pose: { busy: true }, checkOnly: true }
];

function Mark({ ok }: { ok: boolean }) {
  return <span className={`guideMark ${ok ? "ok" : "no"}`} aria-hidden="true">{ok ? "✓" : "✕"}</span>;
}

function Caption({ ok, title, children }: { ok: boolean; title: string; children: ReactNode }) {
  return (
    <figcaption className="guideCaption">
      <span className="guideTitle"><Mark ok={ok} />{title}</span>
      <span className="guideWhy">{children}</span>
    </figcaption>
  );
}

/**
 * `background` is the document's accepted colour, so the photo that passes looks like the
 * one the user is making. `includeBackground` adds the busy-background mistake, which only
 * matters when the photo is checked as it is — the maker replaces the background.
 */
export default function PhotoGuide({ background, includeBackground = false }: { background?: string; includeBackground?: boolean }) {
  const mistakes = MISTAKES.filter(m => includeBackground || !m.checkOnly);

  return (
    <div className="guide">
      <div className="guideTop">
        <figure className="guideGood">
          <Portrait pose={{ guides: true }} background={background} title="A photo that passes" />
          <Caption ok title="Passes">
            Level, square on, neutral, eyes open, evenly lit. Crown to chin fills about
            two-thirds of the height, eyes just above the middle.
          </Caption>
        </figure>

        <figure className="guideSetupFig">
          <SetupDiagram />
          <figcaption className="guideWhy">
            Face a window, not a lamp — the daylight lights both sides of the face evenly. Hold
            the camera at eye level a good step away; close up, a phone lens enlarges the nose.
            Stand clear of the wall so your shadow falls on the floor, not behind your head.
          </figcaption>
        </figure>
      </div>

      <div className="guideLabel mono">Refused</div>
      <div className="guideGrid">
        {mistakes.map(m => (
          <figure key={m.title} className="guideItem">
            <Portrait pose={m.pose} background={background} title={m.title} />
            <Caption ok={false} title={m.title}>{m.why}</Caption>
          </figure>
        ))}
      </div>
    </div>
  );
}
