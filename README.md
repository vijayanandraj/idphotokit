# Passport Photo Builder (Browser-only)

A simple, privacy-friendly passport photo maker that runs entirely in the browser.

If it's useful to you, a ⭐ on the repo helps other people find it.

What it does:
- Upload an image (no server upload)
- Pick your country from 50+ presets — each sets both the print size and the head height
  that country requires — or enter a custom size + DPI
- Crop with manual controls + automatic head framing
- Optional Auto Enhance (brightness/contrast/saturation baseline)
- Background removal (multiclass selfie segmentation, hair-aware) + choose background color
- Download:
  - Single photo (PNG / JPEG)
  - Print sheet (A4 / A3 / 4x6 / Custom) with auto-pack + cut lines

Deployed example (your Vercel URL):
- Add your URL here

https://passport-maker-ten.vercel.app/

---

## Tech Stack

- React + TypeScript
- Vite
- Zustand (state management)
- react-easy-crop (crop UI)
- MediaPipe Tasks Vision (face detection)
- MODNet portrait matting (Apache-2.0), run locally via ONNX Runtime Web

Everything is client-side. The matting model is served from this site rather than a
third-party CDN, so no request describing your photo is made to anyone.

The matting model and its runtime are fetched the first time you remove a background —
about 16MB, then cached by the browser. Nothing is downloaded for the crop-only path.


---

## Features

### Step 1: Upload + Size
- 50+ countries and documents, searchable and grouped by region (`utils/presets.ts`)
- Each preset carries two things, not one:
  - the **print size** (35×45mm across most of the world, 2×2in in the US, 50×70mm in
    Canada, 33×48mm in China, 26×32mm in Spain)
  - the **head height** the authority asks for, as a fraction of the photo. This is the part
    most tools skip: Canada wants the face to fill under half the frame, Australia and Japan
    want about three quarters. Cropping every country to the same proportions gives you a
    photo that is the right size and still gets rejected.
- Where a country publishes no chin-to-crown figure, a neutral ICAO proportion is used and
  the UI says so rather than inventing a number
- Custom size: width / height, units (mm, cm, inch, px), DPI
- Size, preset and DPI live in the URL, so a setup can be bookmarked or shared

### Step 2: Crop
- Manual crop (pan/zoom/rotate)
- Auto-frame head — runs automatically when a photo is loaded:
  - the crown is measured from the segmentation mask (which includes hair), not guessed from
    the face box, so tall or voluminous hair isn't cropped off
  - the chin comes from the face detector, and the frame is laid out to passport proportions:
    head ≈ 62% of the photo height with ~10% clear above the crown
- Auto Enhance:
  - estimates good brightness/contrast/saturation defaults


### Step 3: Background
- Keep original vs background removed
- Background color picker
- Soften edge (extra blur on the finished edge; usually not needed)
- Trim edge (pulls the cut-out edge in to kill a colour fringe; raising it thins fine hair)

The cut-out comes from **MODNet** (`utils/modnet.ts`), a portrait matting model that predicts
alpha directly. It runs locally through ONNX Runtime Web at 512px on the short edge.

This replaced a selfie-segmentation mask plus a lot of colour reasoning, which failed in two
opposite ways that no amount of tuning could fix, because colour alone cannot tell them
apart:

- a blue hair ribbon in front of a blue wall *is* the backdrop colour, so it was deleted
- a cluttered room has no single backdrop colour, so lumps of wall were kept

A model that understands people has no such trouble. `utils/matting.ts` is now only a
finishing pass over the predicted alpha — it resamples onto the output grid, sharpens the
edge along real image edges with a guided filter, and unmixes the old background colour out
of semi-transparent pixels so pale hair keeps no rim of the room it was shot in. None of
those steps can add or remove a region.

Notes:

- the **fp16** weights are used deliberately. MODNet does not survive uint8 quantisation —
  the 6.6MB build produces noise — and fp16 is indistinguishable from fp32 at half the size
- the matte is cached per crop, so changing the background colour or the edge sliders is
  instant rather than re-running inference
- the model download starts as soon as a photo is chosen, overlapping with the crop step
- if the runtime cannot load at all, the old selfie segmentation is used as a fallback and
  the UI says so

### Step 4: Download
- Single image export (PNG/JPEG)
- Print sheet export (PNG/JPEG):
  - A4, A3, 4x6 inch, Custom
  - auto-pack with user-requested count
  - cut lines + outer crop marks


---

## Privacy

This tool is **browser-only**:
- Images never leave your device.
- No backend and no storage.
- Models are downloaded by the browser at runtime (MediaPipe model assets).

If you want “offline / self-hosted models” later, see the notes in the “MediaPipe models” section below.


---

## Setup

### Prerequisites
- Node.js 18+ (recommended)
- npm (or pnpm/yarn)

### Install
```bash
npm install
```

```mermaid
  graph TD;
      A-->B;
      A-->C;
      B-->D;
      C-->D;
```


---

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship it, charge for it; just keep the
copyright notice.

That covers the code in this repository. The things it depends on carry their own terms,
and two are worth knowing about before you build a product on this:

- **MODNet** (`public/models/modnet.onnx`) — the matting network. The MODNet source is
  Apache-2.0, but the officially published pretrained weights are released under
  CC BY-NC-SA 4.0, which is **non-commercial**. If you intend to use this commercially,
  confirm the provenance of the weights you are shipping and retrain or substitute if
  needed.
- **MediaPipe Tasks Vision** — Apache-2.0.
- **ONNX Runtime Web**, **React**, **Vite**, **Zustand**, **react-easy-crop** — MIT or
  Apache-2.0.

The country specifications in `src/utils/presets.ts` are transcriptions of published
government requirements. They are provided as a convenience and are not legal advice —
rules change, and the authority's own guidance is always the authority.
