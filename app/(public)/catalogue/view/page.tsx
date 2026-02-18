'use client';

import { useEffect, useState, useRef, Suspense, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCatalogEntries, type CatalogEntry } from '@/lib/catalogClient';
import ScreenshotRequestFab from '@/components/ScreenshotRequestFab';

function ViewContent() {
  const searchParams = useSearchParams();
  const folderId = searchParams.get('folderId');
  const entryId = searchParams.get('entryId');
  const { t } = useLanguage();
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [entry, setEntry] = useState<CatalogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestFirstName, setRequestFirstName] = useState('');
  const [requestLastName, setRequestLastName] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [requestMobile, setRequestMobile] = useState('');
  const [requestAddress, setRequestAddress] = useState('');
  const [requestNote, setRequestNote] = useState('');

  useEffect(() => {
    if (!folderId || !entryId) {
      setEntry(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getCatalogEntries(folderId)
      .then((list) => {
        if (cancelled) return;
        const found = list.find((e) => e.id === entryId) ?? null;
        setEntry(found);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folderId, entryId]);

  const displayName = entry ? (entry.name?.trim() || entry.fileName || 'PDF') : '';

  const proxyPdfUrl = entry?.fileUrl
    ? `/api/catalog-pdf?url=${encodeURIComponent(entry.fileUrl)}`
    : '';

  const renderPdfPage = useCallback(
    async (pageNum: number) => {
      if (!proxyPdfUrl || !canvasRef.current) return;
      setPdfError(false);
      try {
        const pdfjsLib = await import('pdfjs-dist');
        const pdf = await pdfjsLib.getDocument({ url: proxyPdfUrl }).promise;
        const page = await pdf.getPage(pageNum);
        const scale = Math.min(
          (canvasRef.current.parentElement?.clientWidth ?? 800) / (page.getViewport({ scale: 1 }).width || 1),
          2
        );
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      } catch {
        setPdfError(true);
      }
    },
    [proxyPdfUrl]
  );

  useEffect(() => {
    if (!entry?.fileUrl || !proxyPdfUrl) {
      setNumPages(0);
      setCurrentPage(1);
      return;
    }
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(false);
    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        const pdf = await pdfjsLib.getDocument({ url: proxyPdfUrl }).promise;
        if (cancelled) return;
        setNumPages(pdf.numPages);
        setCurrentPage(1);
      } catch {
        if (!cancelled) setPdfError(true);
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry?.fileUrl, proxyPdfUrl]);

  useEffect(() => {
    if (currentPage >= 1 && currentPage <= numPages) {
      renderPdfPage(currentPage);
    }
  }, [currentPage, numPages, renderPdfPage]);

  return (
    <div className="relative z-10 flex flex-1 flex-col w-full min-h-screen min-h-[100dvh] overflow-x-hidden bg-white">
      {/* Only on PDF view: minimal floating back + request quote + screenshot & request quote */}
      

      {/* PDF rendered via PDF.js so screenshot can capture it (same-origin canvas) */}
      <div ref={pdfContainerRef} className="flex-1 min-h-0 w-full flex flex-col bg-gray-100">
        {loading ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-sm text-gray-500">{t('common.loading')}</p>
          </div>
        ) : !entry ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
            <p className="text-sm text-gray-500 text-center">{t('catalog.noEntries')}</p>
            <Link
              href="/catalogue"
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-white bg-green-power-600 hover:bg-green-power-700"
            >
              {t('catalogue.backToCatalogue', 'Back to catalogue')}
            </Link>
          </div>
        ) : pdfError ? (
          <iframe
            src={entry.fileUrl}
            title={displayName}
            className="flex-1 w-full min-h-0 border-0 block"
          />
        ) : (
          <>
            <div className="flex-1 min-h-0 w-full overflow-auto flex items-start justify-center p-2 sm:p-4">
              {pdfLoading ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-gray-500">{t('common.loading')}</p>
                </div>
              ) : (
                <canvas ref={canvasRef} className="shadow-lg bg-white" style={{ maxWidth: '100%' }} />
              )}
            </div>
            {numPages > 1 && (
              <div className="flex-shrink-0 flex items-center justify-center gap-2 py-2 bg-white border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:pointer-events-none touch-manipulation"
                >
                  {t('common.previous', 'Previous')}
                </button>
                <span className="text-sm text-gray-600 px-2">
                  {currentPage} / {numPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                  disabled={currentPage >= numPages}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:pointer-events-none touch-manipulation"
                >
                  {t('common.next', 'Next')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Request quote modal – same as catalogue page */}
      {entry && requestOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-lg w-full max-h-[90dvh] overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 sticky top-0 bg-white pt-1 pb-2 -mt-1">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-gray-900">{t('catalogue.requestTitle', 'Request a quote')}</h2>
                <p className="text-xs text-gray-600 mt-0.5">{t('catalogue.requestSubtitle', 'We will receive this catalogue page and your contact details.')}</p>
              </div>
              <button
                type="button"
                onClick={() => setRequestOpen(false)}
                className="flex-shrink-0 p-3 min-w-[44px] min-h-[44px] rounded-full text-gray-500 hover:bg-gray-100 touch-manipulation flex items-center justify-center"
                aria-label={t('common.close')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-xs font-semibold text-gray-800 truncate">{displayName}</p>
              {entry.fileName && <p className="text-[11px] text-gray-500 truncate">{entry.fileName}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.firstName')}</label>
                <input type="text" value={requestFirstName} onChange={(e) => setRequestFirstName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-[44px] text-sm touch-manipulation" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.lastName')}</label>
                <input type="text" value={requestLastName} onChange={(e) => setRequestLastName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-[44px] text-sm touch-manipulation" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('common.email')}</label>
                <input type="email" value={requestEmail} onChange={(e) => setRequestEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-[44px] text-sm touch-manipulation" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.mobile')}</label>
                <input type="tel" value={requestMobile} onChange={(e) => setRequestMobile(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-[44px] text-sm touch-manipulation" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.address')}</label>
              <input type="text" value={requestAddress} onChange={(e) => setRequestAddress(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-[44px] text-sm touch-manipulation" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.projectNote')}</label>
              <textarea value={requestNote} onChange={(e) => setRequestNote(e.target.value)} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-3 min-h-[80px] text-sm resize-y touch-manipulation" />
            </div>

            {requestError && <p className="text-xs text-red-600">{requestError}</p>}

            <div className="flex gap-2 justify-end pt-2 pb-1">
              <button type="button" onClick={() => setRequestOpen(false)} className="px-4 py-3 min-h-[44px] rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 touch-manipulation disabled:opacity-50" disabled={requestSubmitting}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!entry || requestSubmitting) return;
                  setRequestError(null);
                  const base = process.env.NEXT_PUBLIC_ADMIN_PANEL_URL || '';
                  const urlBase = base.replace(/\/+$/, '');
                  if (!urlBase) {
                    setRequestError(t('offer.errorMessage'));
                    return;
                  }
                  if (!requestFirstName.trim() || !requestLastName.trim() || !requestEmail.trim() || !requestMobile.trim() || !requestAddress.trim()) {
                    setRequestError(t('offer.validationRequired'));
                    return;
                  }
                  setRequestSubmitting(true);
                  try {
                    const res = await fetch(`${urlBase}/api/offers/submit`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        firstName: requestFirstName.trim(),
                        lastName: requestLastName.trim(),
                        email: requestEmail.trim(),
                        mobile: requestMobile.trim(),
                        address: requestAddress.trim(),
                        projectNote: requestNote.trim() || undefined,
                        items: [{ itemType: 'catalogue', imageUrl: entry.fileUrl, itemName: displayName, color: '', quantityMeters: '', quantityPieces: '', note: requestNote.trim() || undefined }],
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || !data.success) setRequestError(t('offer.errorMessage'));
                    else {
                      setRequestOpen(false);
                      setRequestFirstName('');
                      setRequestLastName('');
                      setRequestEmail('');
                      setRequestMobile('');
                      setRequestAddress('');
                      setRequestNote('');
                    }
                  } catch (e) {
                    console.error(e);
                    setRequestError(t('offer.errorMessage'));
                  } finally {
                    setRequestSubmitting(false);
                  }
                }}
                className="px-4 py-3 min-h-[44px] rounded-lg bg-green-power-600 text-sm font-semibold text-white hover:bg-green-power-700 disabled:opacity-60 touch-manipulation"
                disabled={requestSubmitting}
              >
                {requestSubmitting ? t('offer.submitting') : t('offer.submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CatalogueViewPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-white"><p className="text-sm text-gray-500">Loading…</p></div>}>
      <ViewContent />
    </Suspense>
  );
}
