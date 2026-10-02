import { REPO_URL } from "./GitHubStar";

/**
 * The one thing that separates this from every other passport photo site is that the photo
 * is never uploaded — and users kept missing it. The claim was already in the top bar and
 * the footer, but in both places it reads as a tagline and gets skimmed.
 *
 * Two changes fix that: say it where the hesitation actually happens (next to the file
 * picker, at the moment of handing over a photo of your face), and make it checkable rather
 * than asserted. "Turn your Wi-Fi off and it still works" is something a sceptic can try in
 * five seconds, which is worth more than any badge.
 */
export default function PrivacyNotice() {
  return (
    <section className="privacy" aria-labelledby="privacy-title">
      <span className="privacyMark" aria-hidden="true">🔒</span>

      <div className="privacyBody">
        <h2 className="privacyTitle" id="privacy-title">
          Your photo never leaves this device
        </h2>
        <p className="privacyText">
          There is no server to upload it to. The cropping, the face detection and the
          background removal all run as code inside this browser tab. Nothing is stored
          either — close the tab and the photo is gone.
        </p>

        <details className="privacyProof">
          <summary>Don't take our word for it — check</summary>
          <ul>
            <li>
              <strong>Turn off your Wi-Fi</strong> once this page has loaded. Everything still
              works, because there is nothing to call home to.
            </li>
            <li>
              <strong>Open your browser's Network tab</strong> (F12 → Network) and make a
              photo. You'll see the app's own files and the face model download — no request
              carrying your image.
            </li>
            <li>
              <strong>Read the code.</strong> It's{" "}
              <a href={REPO_URL} target="_blank" rel="noreferrer">public on GitHub</a>, and
              there's no backend in it to find.
            </li>
          </ul>
        </details>
      </div>
    </section>
  );
}
