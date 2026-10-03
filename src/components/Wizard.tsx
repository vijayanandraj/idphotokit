import { Fragment, useEffect } from "react";
import { useAppStore } from "../state/store";
import StepSize from "./steps/StepSize";
import StepCrop from "./steps/StepCrop";
import StepBackground from "./steps/StepBackground";
import StepDownload from "./steps/StepDownload";

const STEPS: Array<{ id: 1 | 2 | 3 | 4; label: string }> = [
  { id: 1, label: "Document" },
  { id: 2, label: "Crop" },
  { id: 3, label: "Background" },
  { id: 4, label: "Download" }
];

export default function Wizard() {
  const step = useAppStore(s => s.step);
  const setStep = useAppStore(s => s.setStep);
  const hydrateFromUrl = useAppStore(s => s.hydrateFromUrl);

  useEffect(() => {
    hydrateFromUrl();
  }, [hydrateFromUrl]);

  return (
    <div className="card">
      <nav className="stepper" aria-label="Wizard steps">
        {STEPS.map((s, i) => (
          <Fragment key={s.id}>
            <button
              type="button"
              className={`stepnode ${step === s.id ? "active" : ""}`}
              aria-current={step === s.id ? "step" : undefined}
              onClick={() => setStep(s.id)}
            >
              <span className="num mono">{s.id}</span>
              <span className="stepLabel">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="stepline" aria-hidden="true" />}
          </Fragment>
        ))}
      </nav>

      {step === 1 && <StepSize />}
      {step === 2 && <StepCrop />}
      {step === 3 && <StepBackground />}
      {step === 4 && <StepDownload />}
    </div>
  );
}
