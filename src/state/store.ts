import { create } from "zustand";
import type { Adjustments, BackgroundSpec, CropState, PhotoSpec, SheetSpec, WizardStep } from "../types";
import { decodeStateFromUrl, encodeStateToUrl } from "../utils/share";
import { defaultBackgroundColor, findPreset } from "../utils/presets";
import { prefetchModnet } from "../utils/modnet";
import { clearMatteCache } from "../utils/personMatte";

type AppState = {
  step: WizardStep;

  // source
  imageFile?: File;
  imageUrl?: string; // Object URL
  imageBitmap?: ImageBitmap;

  // spec
  photo: PhotoSpec;

  // crop + adjustments
  crop: CropState;
  croppedAreaPixels?: { x: number; y: number; width: number; height: number };

  adj: Adjustments;

  // background
  bg: BackgroundSpec;

  // sheet
  sheet: SheetSpec;

  // cached render
  lastRenderUrl?: string;

  /** imageUrl that has already been auto-framed, so we only do it once per photo. */
  autoFramedFor?: string;

  setStep: (s: WizardStep) => void;
  setAutoFramedFor: (url?: string) => void;

  setImageFile: (file?: File) => Promise<void>;
  setPhoto: (p: Partial<PhotoSpec>) => void;
  setCrop: (c: Partial<CropState>) => void;
  setCroppedAreaPixels: (r: { x: number; y: number; width: number; height: number }) => void;
  setAdj: (a: Partial<Adjustments>) => void;
  setBg: (b: Partial<BackgroundSpec>) => void;
  setSheet: (s: Partial<SheetSpec>) => void;

  syncToUrl: () => void;
  hydrateFromUrl: () => void;
};

const defaultPhoto: PhotoSpec = {
  presetId: "IND",
  width: 35,
  height: 45,
  unit: "mm",
  dpi: 300
};

const defaultCrop: CropState = { cropX: 0, cropY: 0, zoom: 1, rotation: 0 };

const defaultAdj: Adjustments = { brightness: 0, contrast: 0, saturation: 0, autoEnhanced: false };

const defaultBg: BackgroundSpec = {
  mode: "REMOVED",
  // Follows the starting country rather than being hard-coded, so the two never disagree.
  color: defaultBackgroundColor(findPreset(defaultPhoto.presetId)),
  // Matting already produces a properly soft edge; extra blur only smears hair detail.
  featherPx: 0,
  // Deliberately low: higher values trade hair detail for a cleaner fringe.
  edgeTighten: 0.15
};

const defaultSheet: SheetSpec = {
  // 4x6 is what photo counters and home printers actually load, and it takes six
  // 35x45mm photos — enough for a passport application with spares. A4 is a document
  // size: printing photos on it wastes most of the page.
  paper: "P4x6"
};

export const useAppStore = create<AppState>((set, get) => ({
  step: 1,

  photo: { ...defaultPhoto },
  crop: { ...defaultCrop },
  adj: { ...defaultAdj },
  bg: { ...defaultBg },
  sheet: { ...defaultSheet },

  setStep: (s) => set({ step: s }),
  setAutoFramedFor: (url) => set({ autoFramedFor: url }),

  setImageFile: async (file?: File) => {
    const prevUrl = get().imageUrl;
    if (prevUrl) URL.revokeObjectURL(prevUrl);

    if (!file) {
      set({ imageFile: undefined, imageUrl: undefined, imageBitmap: undefined });
      return;
    }

    // Start the ~13MB matting model downloading now, so it lands while the crop step is
    // being used rather than stalling the background step later.
    prefetchModnet();
    clearMatteCache();

    const url = URL.createObjectURL(file);
    const bitmap = await createImageBitmap(file);
    set({
      imageFile: file,
      imageUrl: url,
      imageBitmap: bitmap,
      // A new photo starts from a clean crop; the old one's framing means nothing here.
      crop: { ...defaultCrop },
      croppedAreaPixels: undefined,
      autoFramedFor: undefined,
      step: 2
    });
  },

  setPhoto: (p) => {
    const next = { ...get().photo, ...p };

    if (p.presetId) {
      const preset = findPreset(p.presetId);
      if (preset) {
        next.width = preset.width;
        next.height = preset.height;
        next.unit = preset.unit;

        // Choosing a country also applies the background it asks for. Most people never
        // touch the colour picker, so defaulting every country to white quietly produced
        // non-compliant photos for the ones that want grey or cream.
        set({ bg: { ...get().bg, color: defaultBackgroundColor(preset) } });
      }
    }

    set({ photo: next });
  },

  setCrop: (partial) =>
  set((st) => ({
    crop: { ...st.crop, ...partial }
  })),
  setCroppedAreaPixels: (r) => set({ croppedAreaPixels: r }),
  setAdj: (a) => set({ adj: { ...get().adj, ...a } }),
  setBg: (b) => set({ bg: { ...get().bg, ...b } }),
  setSheet: (s) => set({ sheet: { ...get().sheet, ...s } }),

  syncToUrl: () => {
    const st = get();
    encodeStateToUrl({
      photo: st.photo,
      sheet: st.sheet
    });
  },

  hydrateFromUrl: () => {
    const decoded = decodeStateFromUrl();
    if (!decoded) return;
    const st = get();
    const photo = { ...st.photo, ...decoded.photo };

    // A shared link carries a country, so it has to bring that country's background with it.
    // This path bypasses setPhoto, so the default has to be applied here too.
    const preset = findPreset(photo.presetId);

    set({
      photo,
      sheet: { ...st.sheet, ...decoded.sheet },
      bg: preset ? { ...st.bg, color: defaultBackgroundColor(preset) } : st.bg
    });
  }
}));
