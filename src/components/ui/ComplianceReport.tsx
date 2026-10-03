import { useAppStore } from "../../state/store";
import type { CheckStatus, Report } from "../../utils/compliance";
import { presetTitle, type Preset } from "../../utils/presets";

const GLYPH: Record<CheckStatus, string> = {
  pass: "✓",
  warn: "!",
  fail: "✕",
  unknown: "?"
};

const VERDICT_TEXT: Record<CheckStatus, string> = {
  pass: "Every measurement is in range",
  warn: "Worth a look before you print",
  fail: "Something needs fixing",
  unknown: "Partly checked"
};

type Props = { report: Report; preset?: Preset; measuring: boolean };

export default function ComplianceReport({ report, preset, measuring }: Props) {
  const setStep = useAppStore(s => s.setStep);

  return (
    <details className={`panel check-${report.verdict}`} open>
      <summary className="panelHead">
        <span className={`checkMark ${report.verdict}`} aria-hidden="true">
          {GLYPH[report.verdict]}
        </span>
        <span className="panelTitle">
          {preset ? `${presetTitle(preset)} requirements` : "Requirements"}
        </span>
        <span className="panelMeta mono">
          {measuring ? "measuring…" : `${report.passed}/${report.total} checks pass`}
        </span>
      </summary>

      <div className="panelBody">
        <div className={`verdict ${report.verdict}`}>{VERDICT_TEXT[report.verdict]}</div>

        <ul className="checkList">
          {report.checks.map(c => (
            <li key={c.id} className={`checkRow ${c.status}`}>
              <span className={`checkMark ${c.status}`} aria-hidden="true">{GLYPH[c.status]}</span>
              <span className="checkLabel">{c.label}</span>
              <span className="checkValue mono">{c.value}</span>
              {c.requirement && <span className="checkReq">needs {c.requirement}</span>}
              {c.status !== "pass" && c.advice && <span className="checkAdvice">{c.advice}</span>}
            </li>
          ))}
        </ul>

        {report.verdict !== "pass" && (
          <div className="row wrap" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setStep(2)}>Back to crop</button>
            <button className="btn" onClick={() => setStep(3)}>Back to background</button>
          </div>
        )}

        <div className="small" style={{ marginTop: 12 }}>
          These are the parts that can be measured. Expression, glasses, shadows and lighting
          are judged by a person — see the tips on step 1. Requirements change, and the
          authority's own guidance is always the authority.
        </div>
      </div>
    </details>
  );
}
