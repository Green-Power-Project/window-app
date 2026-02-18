'use client';

import { useEffect, useState, useRef } from 'react';

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
        const pdfjsLib = await import('pdfjs-dist');
        const pdf = await pdfjsLib.getDocument({ url: fileUrl }).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const scale = 1.5;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setFailed(true);
          return;
        }
        const task = page.render({ canvasContext: ctx, viewport });
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
        className={`object-cover w-full h-full rounded-t-xl ${className}`}
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
        <svg className="w-12 h-12 sm:w-14 sm:h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6M9 16h6" />
        </svg>
        <span className="text-xs font-medium">PDF</span>
      </div>
    </div>
  );
}
