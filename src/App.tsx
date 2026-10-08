import Wizard from "./components/Wizard";
import PhotoChecker from "./components/PhotoChecker";
import { useAppStore, type AppMode } from "./state/store";
import { GitHubStarLink, REPO_URL } from "./components/ui/GitHubStar";
import { BRAND } from "./brand";

/** The footer strip, written as the machine-readable zone of an ID card ("I<" document code). */
const MRZ = `I<UTO${BRAND.toUpperCase().replace(/\s+/g, "")}<<PASSPORT<VISA<ID<LICENCE<<FREE<<NO<UPLOAD<<<<<<<<`;

const MODES: Array<{ id: AppMode; label: string; hint: string }> = [
  { id: "make", label: "Make a photo", hint: "from any picture" },
  { id: "check", label: "Check a photo", hint: "you already have" }
];

export default function App() {
  const mode = useAppStore(s => s.mode);
  const setMode = useAppStore(s => s.setMode);

  return (
    <div className="app">
      <header className="topbar">
        {/* A link home: document pages are entry points from search, and the full catalogue
            lives on the homepage. */}
        <a className="brand" href="/">
          <span className="mark">[+]</span>
          {BRAND}
        </a>

        <div className="topbarRight">
          <span className="trustbadge">
            <span className="dot" />
            Runs on your device — nothing is uploaded
          </span>
          <GitHubStarLink />
        </div>
      </header>

      <main className="main">
        <div className="modeSwitch" role="tablist" aria-label="What to do">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={`modeTab ${mode === m.id ? "active" : ""}`}
              onClick={() => setMode(m.id)}
            >
              {m.label} <span className="modeHint">{m.hint}</span>
            </button>
          ))}
        </div>

        {mode === "make" ? <Wizard /> : <PhotoChecker />}
      </main>

      <footer className="footer">
        <div className="footerRow">
          <span>
            Free and open source. No account, no tracking, no photo ever leaves your browser.
          </span>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </div>
        {/* The matting weights are CC BY-NC-SA and every visitor downloads them, so the
            credit and licence belong on the site, not only in the README. */}
        <div className="footerCredits">
          Background removal:{" "}
          <a href="https://github.com/ZHKKKe/MODNet" target="_blank" rel="noreferrer">MODNet</a>{" "}
          by Zhanghan Ke et al., pretrained weights (converted to fp16) under{" "}
          <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">
            CC BY-NC-SA 4.0
          </a>
          . Face and pose detection:{" "}
          <a href="https://ai.google.dev/edge/mediapipe/solutions/guide" target="_blank" rel="noreferrer">
            MediaPipe
          </a>{" "}
          (Apache-2.0). App code:{" "}
          <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT</a>.
        </div>
        <div className="mrz mono" aria-hidden="true">
          {MRZ}
        </div>
      </footer>
    </div>
  );
}
