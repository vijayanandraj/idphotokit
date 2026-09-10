import type { SheetSpec } from "../types";
import { mmToPx, paperToMm, sizeToPx } from "./units";

/**
 * Lay passport photos out on a sheet for printing.
 *
 * The margin, the gap between photos, the number of photos and whether to draw cut lines
 * used to be four inputs on screen. They are not really choices — there is one right answer
 * for each, and getting any of them wrong produces a sheet you cannot use:
 *
 *   - the margin exists because consumer printers cannot print to the paper edge
 *   - the gap exists so there is somewhere to put the scissors
 *   - cut lines are only useful if that gap exists, so they belong together
 *   - the count should be "as many as fit"; you cut off the ones you need and the rest
 *     cost nothing
 *
 * The sheet is rendered at the photo's own DPI. That is not a preference either: the tile
 * is placed pixel-for-pixel, so a sheet rendered at any other DPI prints the photo at the
 * wrong physical size.
 */

/** Unprintable border on a typical consumer printer. */
const MARGIN_MM = 5;

/** Gap between photos — enough to cut down the middle without clipping a face. */
const GUTTER_MM = 3;

export function computeSheetPx(sheet: SheetSpec, dpi: number) {
  if (sheet.paper === "CUSTOM") {
    const unit = sheet.customUnit ?? "mm";
    const w = sheet.customWidth ?? 210;
    const h = sheet.customHeight ?? 297;
    return sizeToPx(w, h, unit, dpi);
  }
  const mm = paperToMm(sheet.paper === "P4x6" ? "P4x6" : sheet.paper);
  return { w: mmToPx(mm.wMm, dpi), h: mmToPx(mm.hMm, dpi) };
}

export type SheetLayout = {
  cols: number;
  rows: number;
  count: number;
  startX: number;
  startY: number;
  gutter: number;
  sheetW: number;
  sheetH: number;
};

/** How many photos fit, and where the block sits on the page. */
export function planSheet(
  sheet: SheetSpec,
  dpi: number,
  tileW: number,
  tileH: number
): SheetLayout {
  const { w: sheetW, h: sheetH } = computeSheetPx(sheet, dpi);
  const margin = mmToPx(MARGIN_MM, dpi);
  const gutter = mmToPx(GUTTER_MM, dpi);

  const usableW = sheetW - 2 * margin;
  const usableH = sheetH - 2 * margin;

  const cols = Math.max(0, Math.floor((usableW + gutter) / (tileW + gutter)));
  const rows = Math.max(0, Math.floor((usableH + gutter) / (tileH + gutter)));

  const gridW = cols > 0 ? cols * tileW + (cols - 1) * gutter : 0;
  const gridH = rows > 0 ? rows * tileH + (rows - 1) * gutter : 0;

  return {
    cols,
    rows,
    count: cols * rows,
    // Centre the block, so the unused paper is shared between both edges.
    startX: Math.floor(margin + (usableW - gridW) / 2),
    startY: Math.floor(margin + (usableH - gridH) / 2),
    gutter,
    sheetW,
    sheetH
  };
}

export function renderSheet(
  tileCanvas: HTMLCanvasElement,
  sheet: SheetSpec,
  dpi: number
): { sheetCanvas: HTMLCanvasElement; layout: SheetLayout } {
  const tileW = tileCanvas.width;
  const tileH = tileCanvas.height;
  const layout = planSheet(sheet, dpi, tileW, tileH);
  const { cols, rows, count, startX, startY, gutter, sheetW, sheetH } = layout;

  const c = document.createElement("canvas");
  c.width = sheetW;
  c.height = sheetH;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sheetW, sheetH);

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    ctx.drawImage(
      tileCanvas,
      startX + col * (tileW + gutter),
      startY + row * (tileH + gutter),
      tileW,
      tileH
    );
  }

  if (cols > 0 && rows > 0) {
    // Cut lines run down the middle of each gutter, so cutting along one never touches a
    // photo. The outer rectangle marks where to trim the block off the page.
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = Math.max(1, Math.round(dpi / 300));

    const gridW = cols * tileW + (cols - 1) * gutter;
    const gridH = rows * tileH + (rows - 1) * gutter;

    for (let col = 1; col < cols; col++) {
      const x = startX + col * tileW + (col - 0.5) * gutter;
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, startY + gridH);
      ctx.stroke();
    }

    for (let row = 1; row < rows; row++) {
      const y = startY + row * tileH + (row - 0.5) * gutter;
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + gridW, y);
      ctx.stroke();
    }

    ctx.strokeRect(startX + 0.5, startY + 0.5, gridW - 1, gridH - 1);
    ctx.restore();
  }

  return { sheetCanvas: c, layout };
}
