'use client';

import { useEffect, useState, useRef } from 'react';
import { getViewportFitColumn, type PdfPageLike } from '@/lib/pdfFitViewport';
import { loadPdfJs } from '@/lib/pdfjsClient';

interface PdfThumbnailProps {
  fileUrl: string;
  alt?: string;
  className?: string;
  /** Aspect ratio of the thumbnail area (e.g. 4/3 for landscape cards). */
  aspectRatio?: number;
}

/**
 * Renders the first page of a PDF as a thumbnail image.
 * Falls back to a document-style placeholder on load error or CORS.
 */
export default function PdfThumbnail({ fileUrl, alt = 'PDF', className = '', aspectRatio = 4 / 3 }: PdfThumbnailProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!fileUrl) {
      setFailed(true);
      return;
    }
    let cancelled = false;

    async function render() {
      try {
        const pdfjsLib = await loadPdfJs();
        const pdf = await pdfjsLib.getDocument({ url: fileUrl }).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const { viewport } = getViewportFitColumn(page as unknown as PdfPageLike, 720, 4);
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setFailed(true);
          return;
        }
        const task = page.render({ canvasContext: ctx, viewport, canvas });
        await task.promise;
        if (cancelled) return;
        setDataUrl(canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        alt={alt}
        className={`object-contain w-full h-full rounded-t-xl ${className}`}
        style={{ aspectRatio }}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 rounded-t-xl ${className}`}
      style={{ aspectRatio }}
      aria-hidden
    >
      <div className="flex flex-col items-center gap-1.5 text-gray-500">
        <img src="/icons/pdf-icon.png" alt="PDF" className="w-12 h-12 sm:w-14 sm:h-14 object-contain opacity-90" />
        <span className="text-xs font-medium">PDF</span>
      </div>
    </div>
  );
}
