/**
 * Picks PDF.js viewport rotation + scale so the full page fits a fixed column width
 * without horizontal clipping. For landscape pages, tries ±90° so the shorter
 * edge spans the column → larger readable scale, still complete page.
 */

import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';

export type PdfPageLike = {
  rotate: number;
  getViewport: (opts: { scale: number; rotation?: number }) => PageViewport;
};

const MAX_CANVAS_EDGE = 8192;

function normalizeRotation(deg: number): number {
  return ((((deg % 360) + 360) % 360) + 360) % 360;
}

/**
 * @param columnWidth - CSS pixels available for the page (scroll column width)
 * @param maxScale - upper bound on scale to limit canvas memory (after fit-width)
 */
export function getViewportFitColumn(
  page: PdfPageLike,
  columnWidth: number,
  maxScale = 6
): { viewport: PageViewport; rotation: number; scale: number } {
  const cw = Math.max(1, columnWidth);
  const base = normalizeRotation(page.rotate);

  let bestRotation = base;
  let bestUnscaled = page.getViewport({ scale: 1, rotation: bestRotation });

  for (let k = 1; k < 4; k++) {
    const rotation = normalizeRotation(base + k * 90);
    const vp = page.getViewport({ scale: 1, rotation });
    if (vp.width < bestUnscaled.width - 0.01) {
      bestRotation = rotation;
      bestUnscaled = vp;
    }
  }

  const scaleFitW = cw / (bestUnscaled.width || 1);
  const scaleCapCanvas = Math.min(
    MAX_CANVAS_EDGE / Math.max(bestUnscaled.width, 1),
    MAX_CANVAS_EDGE / Math.max(bestUnscaled.height, 1)
  );
  const scale = Math.min(scaleFitW, scaleCapCanvas, maxScale);
  const viewport = page.getViewport({ scale, rotation: bestRotation });
  return { viewport, rotation: bestRotation, scale };
}
