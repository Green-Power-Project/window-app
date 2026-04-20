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
        const pdf = (await pdfjsLib.getDocument({ url: pdfUrl }).promise) as unknown as PdfDoc;
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
          const { viewport } = getViewportFitColumn(page as unknown as PdfPageLike, layoutWidth, 8);
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        } catch {
          if (!cancelled) setPhase('error');
          return;
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

  if (phase === 'error') {
    return (
      <div className={`${placeholderShell} gap-4 p-6 ${rootClassName}`.trim()}>
        <p className="text-gray-600 text-sm text-center px-2">{t('common.pdfPreviewUnavailable')}</p>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg bg-green-power-600 text-white text-sm font-medium hover:bg-green-power-700"
        >
          {t('common.download')}
        </a>
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
