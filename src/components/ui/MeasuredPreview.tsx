import type { CSSProperties, Ref } from "react";
import type { PhotoSpec } from "../../types";
import type { CheckStatus, Report } from "../../utils/compliance";
import { DEFAULT_HEAD, formatSize, type Preset } from "../../utils/presets";
import { toInches } from "../../utils/units";

/**
 * The finished photo with its measurements drawn around it, the way a requirements sheet
 * draws them: overall width and height, the gap above the hair, the head height, the eye
 * line. Each marking is coloured by its check, and the head bracket shows the band the
 * document allows, so the claim "this photo is in range" can be seen rather than taken on
 * trust.
 *
 * The markings live outside the photo, in an SVG laid over a margin around the canvas. They
 * are never drawn into the downloaded file.
 */

/** Layout in SVG units. The photo is always PH tall; its width follows the aspect ratio. */
const PH = 400;
const PAD = { top: 18, left: 58, bottom: 50 };
/** Columns to the right of the photo: crown/head brackets, then the eye line. */
const COL1 = 26;
const COL2 = 66;
const RIGHT = 96;

const STATUS_COLOR: Record<CheckStatus, string> = {
  pass: "var(--good)",
  warn: "var(--warn)",
  fail: "var(--redline)",
  unknown: "var(--muted)"
};

type Props = {
  canvasRef: Ref<HTMLCanvasElement>;
  photo: PhotoSpec;
  preset?: Preset;
  report: Report;
  /** False hides the markings and leaves the plain photo. */
  show: boolean;
};

/** A distance along the photo's height or width, in the photo's own units. */
function dimension(fraction: number, total: number, photo: PhotoSpec): string {
  const v = fraction * total;
  if (photo.unit === "px") return `${Math.round(v)} px`;
  if (photo.unit === "in") return `${v.toFixed(2)} in`;
  const mm = toInches(v, photo.unit) * 25.4;
  return `${mm.toFixed(1)} mm`;
}

function pct(f: number): string {
  return `${Math.round(f * 100)}%`;
}

/** An arrowhead at (x, y), pointing away from (fromX, fromY). */
function arrow(x: number, y: number, fromX: number, fromY: number): string {
  const len = Math.hypot(x - fromX, y - fromY) || 1;
  const ux = (x - fromX) / len;
  const uy = (y - fromY) / len;
  const size = Math.min(7, len / 2.5);
  const bx = x - ux * size;
  const by = y - uy * size;
  const half = size * 0.45;
  return `M ${x} ${y} L ${bx - uy * half} ${by + ux * half} L ${bx + uy * half} ${by - ux * half} Z`;
}

/** A dimension line with arrowheads and end ticks. Vertical when x1 === x2. */
function DimLine({
  x1, y1, x2, y2, color, label, labelSide = 1
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; label: string; labelSide?: 1 | -1;
}) {
  const vertical = x1 === x2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const tick = 6;
  return (
    <g stroke={color} fill={color}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={1.2} />
      <path stroke="none" d={arrow(x1, y1, x2, y2)} />
      <path stroke="none" d={arrow(x2, y2, x1, y1)} />
      {vertical ? (
        <>
          <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} strokeWidth={1} />
          <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} strokeWidth={1} />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} strokeWidth={1} />
          <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} strokeWidth={1} />
        </>
      )}
      <text
        x={vertical ? mx + labelSide * 11 : mx}
        y={vertical ? my : my + 18}
        stroke="none"
        fontSize={12.5}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={vertical ? `rotate(-90 ${mx + labelSide * 11} ${my})` : undefined}
        className="mono"
      >
        {label}
      </text>
    </g>
  );
}

export default function MeasuredPreview({ canvasRef, photo, preset, report, show }: Props) {
  const aspect = photo.width / photo.height;
  const PW = PH * aspect;
  const W = PAD.left + PW + RIGHT;
  const H = PAD.top + PH + PAD.bottom;

  const x0 = PAD.left;
  const y0 = PAD.top;
  const xR = x0 + PW;
  const yB = y0 + PH;
  const Y = (f: number) => y0 + f * PH;

  const status = (id: string): CheckStatus => report.checks.find(c => c.id === id)?.status ?? "unknown";
  const g = report.geometry;
  const range = preset?.head ?? DEFAULT_HEAD;

  // Percentages place the canvas exactly on the photo rectangle of the SVG's coordinate system.
  // Hidden markings collapse the margin; the canvas element itself stays the same one either
  // way, so toggling never wipes what was drawn into it.
  const canvasStyle = show
    ? {
        left: `${(x0 / W) * 100}%`,
        top: `${(y0 / H) * 100}%`,
        width: `${(PW / W) * 100}%`,
        height: `${(PH / H) * 100}%`
      }
    : { left: 0, top: 0, width: "100%", height: "100%" };

  const headColor = STATUS_COLOR[status("head")];
  const gapColor = STATUS_COLOR[status("headroom")];
  const eyeColor = STATUS_COLOR[status("eyeline")];

  return (
    <div
      className="measured"
      style={{ aspectRatio: show ? `${W} / ${H}` : `${aspect}`, "--ar": show ? W / H : aspect } as CSSProperties}
    >
      <canvas ref={canvasRef} className="measuredCanvas" style={canvasStyle} />

      {show && <svg
        className="measuredMarks"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Photo ${formatSize(photo)}${g ? `, head ${pct(g.chin - g.crown)} of the height` : ""}`}
      >
        {/* Photo edge. */}
        <rect x={x0} y={y0} width={PW} height={PH} fill="none" stroke="var(--line-strong)" />

        {/* Overall height, left. */}
        <DimLine
          x1={x0 - 26} y1={y0} x2={x0 - 26} y2={yB}
          color="var(--ink)" label={`${+photo.height.toFixed(2)} ${photo.unit}`}
          labelSide={-1}
        />

        {/* Overall width, bottom. */}
        <DimLine
          x1={x0} y1={yB + 18} x2={xR} y2={yB + 18}
          color="var(--ink)" label={`${+photo.width.toFixed(2)} ${photo.unit}`}
        />

        {g && (
          <>
            {/* Leader lines from the crown and chin out to the brackets. */}
            <g stroke="var(--ink)" strokeOpacity={0.45} strokeDasharray="3 3" strokeWidth={1}>
              <line x1={x0 + g.centerX * PW} y1={Y(g.crown)} x2={xR + COL1 + 6} y2={Y(g.crown)} />
              <line x1={x0 + g.centerX * PW} y1={Y(g.chin)} x2={xR + COL1 + 6} y2={Y(g.chin)} />
            </g>

            {/* The band the chin may fall in, given where the crown is. */}
            <rect
              x={xR + COL1 - 5}
              y={Y(g.crown + range.min)}
              width={10}
              height={Math.max(1, (range.max - range.min) * PH)}
              fill="var(--good)"
              fillOpacity={0.18}
            />

            {g.crown > 0.005 && (
              <DimLine
                x1={xR + COL1} y1={y0} x2={xR + COL1} y2={Y(g.crown)}
                color={gapColor} label={pct(g.crown)}
              />
            )}
            <DimLine
              x1={xR + COL1} y1={Y(Math.max(0, g.crown))} x2={xR + COL1} y2={Y(g.chin)}
              color={headColor} label={`head ${pct(g.chin - g.crown)}`}
            />

            {g.eye !== undefined && (
              <>
                {preset?.eyeLine && (
                  <rect
                    x={xR + COL2 - 5}
                    y={Y(1 - preset.eyeLine.max)}
                    width={10}
                    height={(preset.eyeLine.max - preset.eyeLine.min) * PH}
                    fill="var(--good)"
                    fillOpacity={0.18}
                  />
                )}
                <line
                  x1={x0} y1={Y(g.eye)} x2={xR + COL2 + 6} y2={Y(g.eye)}
                  stroke={eyeColor} strokeOpacity={0.7} strokeDasharray="6 4" strokeWidth={1}
                />
                <DimLine
                  x1={xR + COL2} y1={Y(g.eye)} x2={xR + COL2} y2={yB}
                  color={eyeColor} label={`eyes ${dimension(1 - g.eye, photo.height, photo)}`}
                />
              </>
            )}
          </>
        )}
      </svg>}
    </div>
  );
}
