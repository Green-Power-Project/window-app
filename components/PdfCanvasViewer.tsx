'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getViewportFitColumn, type PdfPageLike } from '@/lib/pdfFitViewport';
import { loadPdfJs } from '@/lib/pdfjsClient';

export type PdfCanvasViewerHandle = {
  /** Merges all rendered page canvases into one PNG (catalogue screenshot flow). */
  captureScreenshot: () => Promise<{ file: File; previewUrl: string } | null>;
};

export type PdfCanvasViewerProps = {
  pdfUrl: string;
  /**
   * card: framed preview (folder/chat modals).
   * flush: no outer frame; use inside bordered parents (e.g. sign-document review).
   */
  variant?: 'card' | 'flush';
  /** Appended to variant-specific outer classes for all phases (loading, error, ready). */
  rootClassName?: string;
};

type PdfDoc = {
  numPages: number;
  destroy?: () => void;
  getPage: (n: number) => Promise<{
    rotate: number;
    getViewport: (o: { scale: number; rotation?: number }) => { width: number; height: number };
    render: (o: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
      canvas: HTMLCanvasElement;
    }) => { promise: Promise<void> };
  }>;
};

/** Same-origin / proxy URLs: avoid range/stream issues that break some stamped (larger) PDFs on mobile. */
async function openPdfDocument(
  pdfjsLib: { getDocument: (src: object) => { promise: Promise<unknown> } },
  pdfUrl: string
): Promise<PdfDoc> {
  const baseOpts = {
    disableRange: true,
    disableStream: true,
    verbosity: 0,
  } as const;

  // Same-origin/proxy files are the common case here; fetch once as bytes to avoid URL->fallback double loads.
  if (pdfUrl.startsWith('/')) {
    const res = await fetch(pdfUrl, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(`PDF fetch ${res.status}`);
    const buf = await res.arrayBuffer();
    return (await pdfjsLib
      .getDocument({ data: new Uint8Array(buf), ...baseOpts })
      .promise) as unknown as PdfDoc;
  }

  try {
    return (await pdfjsLib.getDocument({ url: pdfUrl, ...baseOpts }).promise) as unknown as PdfDoc;
  } catch {
    // Fall back: full fetch then parse (fixes odd server/range/CORS behaviour for some files)
    const res = await fetch(pdfUrl, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(`PDF fetch ${res.status}`);
    const buf = await res.arrayBuffer();
    return (await pdfjsLib
      .getDocument({ data: new Uint8Array(buf), ...baseOpts })
      .promise) as unknown as PdfDoc;
  }
}

function drawPageRenderFailed(canvas: HTMLCanvasElement, layoutWidth: number, pageNum: number) {
  const w = Math.max(120, Math.min(layoutWidth || 320, 800));
  const h = 72;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.fillStyle = '#6b7280';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`Page ${pageNum} could not be previewed here.`, 12, 28);
}

function compositeVerticalCanvases(canvases: HTMLCanvasElement[]): Promise<{ file: File; previewUrl: string } | null> {
  if (canvases.length === 0) return Promise.resolve(null);
  if (canvases.length === 1) {
    const c = canvases[0];
    return new Promise((resolve) => {
      c.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
          resolve({ file, previewUrl: URL.createObjectURL(blob) });
        },
        'image/png',
        0.92
      );
    });
  }
  let maxW = 0;
  let totalH = 0;
  for (const c of canvases) {
    maxW = Math.max(maxW, c.width);
    totalH += c.height;
  }
  const out = document.createElement('canvas');
  out.width = maxW;
  out.height = totalH;
  const ctx = out.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  let y = 0;
  for (const c of canvases) {
    const x = Math.round((maxW - c.width) / 2);
    ctx.drawImage(c, x, y);
    y += c.height;
  }
  return new Promise((resolve) => {
    out.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
        resolve({ file, previewUrl: URL.createObjectURL(blob) });
      },
      'image/png',
      0.92
    );
  });
}

/**
 * Renders PDF with PDF.js on canvases, one page below the next (vertical scroll only).
 * Avoids Android Chrome / TWA iframe behavior and horizontal "paged" side navigation.
 */
const PdfCanvasViewer = forwardRef<PdfCanvasViewerHandle, PdfCanvasViewerProps>(function PdfCanvasViewer(
  { pdfUrl, variant = 'card', rootClassName = '' },
  ref
) {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PdfDoc | null>(null);
  const canvasByPageRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const [numPages, setNumPages] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [layoutWidth, setLayoutWidth] = useState(0);

  const collectOrderedCanvases = useCallback(() => {
    const out: HTMLCanvasElement[] = [];
    for (let i = 1; i <= numPages; i++) {
      const c = canvasByPageRef.current.get(i);
      if (c && c.width > 0 && c.height > 0) out.push(c);
    }
    return out;
  }, [numPages]);

  useImperativeHandle(
    ref,
    () => ({
      captureScreenshot: async () => compositeVerticalCanvases(collectOrderedCanvases()),
    }),
    [collectOrderedCanvases]
  );

  useEffect(() => {
    let cancelled = false;
    pdfDocRef.current = null;
    setPhase('loading');
    setNumPages(0);
    canvasByPageRef.current.clear();
    (async () => {
      try {
        const pdfjsLib = await loadPdfJs();
        const pdf = await openPdfDocument(pdfjsLib as { getDocument: (src: object) => { promise: Promise<unknown> } }, pdfUrl);
        if (cancelled) {
          pdf.destroy?.();
          return;
        }
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      const d = pdfDocRef.current;
      pdfDocRef.current = null;
      d?.destroy?.();
    };
  }, [pdfUrl]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w =
        el.clientWidth ||
        el.parentElement?.clientWidth ||
        (typeof window !== 'undefined' ? Math.min(window.innerWidth, 1600) : 0);
      setLayoutWidth((prev) => (w > 0 ? w : prev));
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  useEffect(() => {
    if (phase !== 'ready' || !numPages || layoutWidth <= 0) return;
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    let cancelled = false;

    (async () => {
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (cancelled) return;
        const canvas = canvasByPageRef.current.get(pageNum);
        if (!canvas) continue;
        try {
          const page = await pdf.getPage(pageNum);
          const { viewport, rotation, scale } = getViewportFitColumn(
            page as unknown as PdfPageLike,
            layoutWidth,
            8
          );
          const dpr = typeof window !== 'undefined' ? Math.max(1, Math.min(window.devicePixelRatio || 1, 2)) : 1;
          const renderViewport = (page as unknown as PdfPageLike).getViewport({
            scale: scale * dpr,
            rotation,
          });
          canvas.width = Math.max(1, Math.floor(renderViewport.width));
          canvas.height = Math.max(1, Math.floor(renderViewport.height));
          canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`;
          canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;
        } catch {
          drawPageRenderFailed(canvas, layoutWidth, pageNum);
          // Avoid iframe fallback (Android “Open” / stuck 100%): one bad page should not break the whole doc.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, numPages, layoutWidth, pdfUrl]);

  const cardShell =
    variant === 'card'
      ? 'w-full max-w-4xl max-h-[90vh] flex flex-col rounded-lg bg-white overflow-hidden border border-gray-200 shadow-lg min-w-0'
      : 'w-full flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-white';

  const placeholderShell =
    variant === 'card'
      ? 'w-full h-[min(90vh,640px)] max-w-4xl rounded-lg bg-white flex flex-col items-center justify-center border border-gray-200 min-w-0'
      : 'w-full flex flex-1 min-h-[min(200px,40vh)] flex-col items-center justify-center bg-white min-w-0';

  if (phase === 'loading') {
    return (
      <div className={`${placeholderShell} ${rootClassName}`.trim()}>
        <span className="text-gray-500 text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  /** PDF.js failed (CORS, worker, corrupt file, etc.) — embed with native viewer instead of an error screen. */
  if (phase === 'error') {
    const iframeShell =
      variant === 'card'
        ? 'w-full max-w-4xl max-h-[90vh] flex flex-col rounded-lg bg-white overflow-hidden border border-gray-200 shadow-lg min-w-0 min-h-[min(90vh,640px)]'
        : 'w-full flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-white min-h-[min(55vh,480px)]';
    const iframeMin =
      variant === 'card' ? 'min-h-[min(70vh,560px)]' : 'min-h-[min(50vh,420px)]';
    return (
      <div className={`${iframeShell} ${rootClassName}`.trim()}>
        <iframe
          src={pdfUrl}
          title="PDF"
          className={`block w-full flex-1 border-0 bg-white ${iframeMin}`}
        />
      </div>
    );
  }

  return (
    <div className={`${cardShell} ${rootClassName}`.trim()}>
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden overscroll-x-contain touch-pan-y bg-gray-50"
      >
        <div className="flex flex-col items-stretch gap-3 p-2 w-full max-w-full min-w-0">
          {Array.from({ length: numPages }, (_, idx) => {
            const pageIndex = idx + 1;
            return (
              <div key={`${pdfUrl}-${pageIndex}`} className="w-full min-w-0 flex justify-center">
                <canvas
                  ref={(el) => {
                    if (el) canvasByPageRef.current.set(pageIndex, el);
                    else canvasByPageRef.current.delete(pageIndex);
                  }}
                  data-pdf-vertical-page={pageIndex}
                  className="block max-w-full h-auto w-auto bg-white shadow-sm"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default PdfCanvasViewer;
