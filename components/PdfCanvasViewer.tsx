'use client';

import { forwardRef, useImperativeHandle } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

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

const PdfCanvasViewer = forwardRef<PdfCanvasViewerHandle, PdfCanvasViewerProps>(function PdfCanvasViewer(
  { pdfUrl, variant = 'card', rootClassName = '' },
  ref
) {
  const { t } = useLanguage();

  useImperativeHandle(
    ref,
    () => ({
      captureScreenshot: async () => null,
    }),
    []
  );

  const cardShell =
    variant === 'card'
      ? 'w-full max-w-4xl rounded-lg bg-white border border-gray-200 shadow-lg min-w-0 p-6'
      : 'w-full rounded-lg bg-white border border-gray-200 min-w-0 p-6';

  return (
    <div className={`${cardShell} ${rootClassName}`.trim()}>
      <div className="flex flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-gray-600">{t('projects.signReviewOpenInNewTabHint')}</p>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-green-power-600 text-white text-sm font-medium hover:bg-green-power-700"
        >
          {t('projects.signOpenPdfNewTab')}
        </a>
      </div>
    </div>
  );
});

export default PdfCanvasViewer;
