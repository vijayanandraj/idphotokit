import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "./store";
import { measureHead, type HeadMetrics } from "../utils/autoframe";
import { buildReport, type Report } from "../utils/compliance";
import { analysePose, type FacePose } from "../utils/pose";
import { findPreset, type Preset } from "../utils/presets";
import { sizeToPx } from "../utils/units";

/**
 * The finished photo checked against its document's requirements.
 *
 * Called once on the download step and handed to both the checklist and the measured
 * preview, so the two can never disagree about where the head is.
 */
export function useComplianceReport(): { report: Report; preset?: Preset; measuring: boolean } {
  const photo = useAppStore(s => s.photo);
  const crop = useAppStore(s => s.crop);
  const croppedAreaPixels = useAppStore(s => s.croppedAreaPixels);
  const bg = useAppStore(s => s.bg);
  const imageBitmap = useAppStore(s => s.imageBitmap);
  const imageUrl = useAppStore(s => s.imageUrl);

  // measureHead caches its matte, so this is cheap on anything but the first call. The
  // result is stored with the photo it was measured from, so a new photo reads as "not
  // measured yet" without having to clear the old value first — which would mean writing
  // state synchronously inside the effect.
  const [measured, setMeasured] = useState<{ key?: string; metrics: HeadMetrics | null; pose: FacePose | null }>();

  useEffect(() => {
    if (!imageBitmap) return;
    let live = true;
    const key = imageUrl;
    // Each failure is its own: a pose model that won't load shouldn't cost the framing checks.
    void Promise.all([
      measureHead(imageBitmap).catch(() => null),
      analysePose(imageBitmap).catch(() => null)
    ]).then(([metrics, pose]) => { if (live) setMeasured({ key, metrics, pose }); });
    return () => { live = false; };
  }, [imageBitmap, imageUrl]);

  const fresh = !!measured && measured.key === imageUrl;
  const head = fresh ? measured.metrics : undefined;
  const pose = fresh ? measured.pose : undefined;

  const preset = useMemo(() => findPreset(photo.presetId), [photo.presetId]);
  const outPx = useMemo(() => sizeToPx(photo.width, photo.height, photo.unit, photo.dpi), [photo]);

  const report = useMemo(
    () =>
      buildReport({
        photo,
        preset,
        bg,
        crop: croppedAreaPixels,
        rotation: crop.rotation,
        head,
        pose,
        outPx
      }),
    [photo, preset, bg, croppedAreaPixels, crop.rotation, head, pose, outPx]
  );

  return { report, preset, measuring: !!imageBitmap && !fresh };
}
