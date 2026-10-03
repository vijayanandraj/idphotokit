import Wizard from "./components/Wizard";
import { GitHubStarLink, REPO_URL } from "./components/ui/GitHubStar";
import { BRAND } from "./brand";

/** The footer strip, written as the machine-readable zone of an ID card ("I<" document code). */
const MRZ = `I<UTO${BRAND.toUpperCase().replace(/\s+/g, "")}<<PASSPORT<VISA<ID<LICENCE<<FREE<<NO<UPLOAD<<<<<<<<`;

export default function App() {
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
        <Wizard />
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
        <div className="mrz mono" aria-hidden="true">
          {MRZ}
        </div>
      </footer>
    </div>
  );
}
