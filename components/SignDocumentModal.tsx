'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useLanguage } from '@/contexts/LanguageContext';
import { getAdminPanelBaseUrl } from '@/lib/adminPanelUrl';
import PdfCanvasViewer from '@/components/PdfCanvasViewer';

export type SignModalFile = {
  fileName: string;
  fileUrl: string;
  fileKey: string;
  fileType: string;
};

export type SignSubmitResult = {
  stamped: boolean;
  stampReason?: string;
};

type SignRole = 'client' | 'representative';

type Phase = 'review' | 'form' | 'sign';

type Props = {
  file: SignModalFile;
  pdfSrc?: string;
  projectId: string;
  folderPath: string;
  customerId: string;
  onClose: () => void;
  onSuccess: (result: SignSubmitResult) => void;
  /** Opens the same comment flow as the folder page for this file. */
  onReportProblem: () => void;
};

// Allow roughly 0.5cm overflow around drawn strokes before final crop.
const SIGNATURE_OVERFLOW_MARGIN_CSS_PX = 19;

function extractSignatureWithMargin(sig: SignatureCanvas): string | null {
  const canvas = sig.getCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width, height } = canvas;
  if (width <= 0 || height <= 0) return null;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a !== 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null;

  const cssW = canvas.clientWidth || 1;
  const pxPerCss = width / cssW;
  const marginPx = Math.max(1, Math.round(SIGNATURE_OVERFLOW_MARGIN_CSS_PX * pxPerCss));

  const sx = Math.max(0, minX - marginPx);
  const sy = Math.max(0, minY - marginPx);
  const ex = Math.min(width - 1, maxX + marginPx);
  const ey = Math.min(height - 1, maxY + marginPx);
  const sw = Math.max(1, ex - sx + 1);
  const sh = Math.max(1, ey - sy + 1);

  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;
  outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL('image/png');
}

export default function SignDocumentModal({
  file,
  pdfSrc,
  projectId,
  folderPath,
  customerId,
  onClose,
  onSuccess,
  onReportProblem,
}: Props) {
  const { t } = useLanguage();
  const sigRef = useRef<SignatureCanvas>(null);
  const signingLandscapeSessionRef = useRef<{ requestedFullscreen: boolean }>({
    requestedFullscreen: false,
  });
  const [phase, setPhase] = useState<Phase>('review');
  const [signRole, setSignRole] = useState<SignRole | null>(null);
  const [signatoryName, setSignatoryName] = useState('');
  const [placeText, setPlaceText] = useState('');
  const [confirmationAccepted, setConfirmationAccepted] = useState(false);
  const [displayNow, setDisplayNow] = useState(() => new Date());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setDisplayNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const isLikelyMobile = () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 1024px) and (pointer: coarse)').matches;

    const unlockSigningOrientation = async () => {
      try {
        const orientationApi = (screen as Screen & {
          orientation?: { unlock?: () => void | Promise<void> };
        }).orientation;
        await orientationApi?.unlock?.();
      } catch {
        // best-effort only
      }
      try {
        if (
          signingLandscapeSessionRef.current.requestedFullscreen &&
          document.fullscreenElement &&
          document.exitFullscreen
        ) {
          await document.exitFullscreen();
        }
      } catch {
        // best-effort only
      } finally {
        signingLandscapeSessionRef.current.requestedFullscreen = false;
      }
    };

    const lockSigningLandscape = async () => {
      if (phase !== 'sign' || !isLikelyMobile()) {
        await unlockSigningOrientation();
        return;
      }
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          signingLandscapeSessionRef.current.requestedFullscreen = true;
        }
      } catch {
        signingLandscapeSessionRef.current.requestedFullscreen = false;
      }
      try {
        const orientationApi = (screen as Screen & {
          orientation?: { lock?: (orientation: 'landscape') => Promise<void> };
        }).orientation;
        if (orientationApi?.lock) {
          await orientationApi.lock('landscape');
        }
      } catch {
        // Some browsers (especially iOS) block lock; keep normal flow.
      }
    };

    void lockSigningLandscape();
    return () => {
      void unlockSigningOrientation();
    };
  }, [phase]);

  const clearSignature = useCallback(() => {
    sigRef.current?.clear();
  }, []);

  const handleClose = () => {
    setPhase('review');
    setSignRole(null);
    setSignatoryName('');
    setPlaceText('');
    setConfirmationAccepted(false);
    setError('');
    clearSignature();
    onClose();
  };

  const canContinueForm =
    signRole !== null &&
    confirmationAccepted &&
    signatoryName.trim().length > 0 &&
    placeText.trim().length > 0;

  const handleSubmit = async () => {
    setError('');
    if (!canContinueForm || !signRole) {
      setError(t('projects.signStep1Incomplete'));
      return;
    }
    const sig = sigRef.current;
    if (!sig || sig.isEmpty()) {
      setError(t('projects.signSignatureRequired'));
      return;
    }
    const signatureDataUrl = extractSignatureWithMargin(sig) ?? sig.getCanvas().toDataURL('image/png');
    if (!signatureDataUrl || signatureDataUrl.length < 200) {
      setError(t('projects.signSignatureRequired'));
      return;
    }
    const adminBase = getAdminPanelBaseUrl();
    if (!adminBase) {
      setError(t('messages.error.generic'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${adminBase}/api/report-signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          folderPath,
          filePath: file.fileKey,
          fileName: file.fileName,
          customerId,
          signRole,
          signatoryName: signatoryName.trim(),
          placeText: placeText.trim(),
          confirmationAccepted: true,
          signatureDataUrl,
          displayTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        code?: string;
        stamped?: boolean;
        stampReason?: string;
      } | null;
      if (res.status === 409 || data?.code === 'ALREADY_SIGNED') {
        setError(t('projects.signAlreadySigned'));
        return;
      }
      if (!res.ok || !data?.success) throw new Error('fail');
      onSuccess({
        stamped: data?.stamped === true,
        stampReason: typeof data?.stampReason === 'string' ? data?.stampReason : undefined,
      });
      handleClose();
    } catch {
      setError(t('messages.error.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    phase === 'review'
      ? t('projects.signReportTitleReview')
      : phase === 'form'
        ? t('projects.signReportTitleStep1')
        : t('projects.signReportTitleStep2');

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center p-2 sm:p-4 bg-black/60" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-4xl max-h-[min(100dvh,100svh)] sm:max-h-[92vh] overflow-hidden flex flex-col my-auto min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex items-start justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5 break-all">{file.fileName}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg hover:bg-gray-100 text-gray-600 shrink-0 flex items-center justify-center touch-manipulation"
            aria-label={t('common.close')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs px-3 py-2">{error}</div>
          )}

          {phase === 'review' && (
            <div className="flex flex-col min-h-[min(70vh,640px)] gap-0 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
              <PdfCanvasViewer
                pdfUrl={pdfSrc ?? file.fileUrl}
                variant="flush"
                rootClassName="min-h-[min(55vh,480px)] flex-1 w-full"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between px-3 sm:px-4 py-3 border-t border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => {
                    onReportProblem();
                    handleClose();
                  }}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 touch-manipulation"
                >
                  {t('projects.signReportProblemButton')}
                </button>
                <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto sm:ml-auto">
                  <a
                    href={pdfSrc ?? file.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center sm:text-left text-xs font-medium text-indigo-600 hover:text-indigo-800 px-3 py-2.5 min-h-[44px] flex items-center justify-center sm:inline-flex touch-manipulation"
                  >
                    {t('projects.signOpenPdfNewTab')}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setPhase('form');
                    }}
                    className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 touch-manipulation"
                  >
                    {t('projects.signDocumentButton')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {phase === 'form' && (
            <>
              <p className="text-sm text-gray-700">{t('projects.signStep1Intro')}</p>
              <div>
                <p className="text-xs font-semibold text-gray-800 mb-2">{t('projects.signRoleHeading')}</p>
                <ul className="list-disc ml-5 space-y-2 text-sm text-gray-800">
                  <li>
                    <label className="inline-flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="signRole"
                        className="mt-1"
                        checked={signRole === 'client'}
                        onChange={() => setSignRole('client')}
                      />
                      <span>{t('projects.signRoleBulletClient')}</span>
                    </label>
                  </li>
                  <li>
                    <label className="inline-flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="signRole"
                        className="mt-1"
                        checked={signRole === 'representative'}
                        onChange={() => setSignRole('representative')}
                      />
                      <span>{t('projects.signRoleBulletRepresentative')}</span>
                    </label>
                  </li>
                </ul>
              </div>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmationAccepted}
                  onChange={(e) => setConfirmationAccepted(e.target.checked)}
                  className="mt-1 rounded border-gray-300 shrink-0"
                />
                <span className="text-sm text-gray-800 leading-snug">{t('projects.signConsentReportFull')}</span>
              </label>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('projects.signNameLabel')} *</label>
                <input
                  type="text"
                  value={signatoryName}
                  onChange={(e) => setSignatoryName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder={t('projects.signNamePlaceholder')}
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('projects.signPlaceLabel')} *</label>
                <input
                  type="text"
                  value={placeText}
                  onChange={(e) => setPlaceText(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder={t('projects.signPlacePlaceholder')}
                  autoComplete="street-address"
                />
                <p className="text-xs text-gray-500 mt-1">{t('projects.signPlaceManualHint')}</p>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-xs font-medium text-gray-600">{t('projects.signDateTimeAuto')}</p>
                <p className="text-sm font-medium text-gray-900 tabular-nums">
                  {displayNow.toLocaleString(undefined, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </p>
              </div>
            </>
          )}

          {phase === 'sign' && (
            <>
              <p className="text-xs text-gray-600">{t('projects.signStep2Hint')}</p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('projects.signDrawLabel')} *</label>
                <div className="relative rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <SignatureCanvas
                    ref={sigRef}
                    canvasProps={{
                      className: 'w-full h-44 sm:h-40 touch-none',
                      style: { width: '100%', height: '176px' },
                    }}
                    backgroundColor="rgba(255,255,255,1)"
                    penColor="#2563eb"
                  />
                  <div className="pointer-events-none absolute inset-[10px] rounded-md border border-dashed border-gray-300/70" />
                </div>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="mt-2 text-xs text-indigo-600 hover:text-indigo-800"
                >
                  {t('projects.signClear')}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-gray-100 flex flex-wrap justify-end gap-2 shrink-0">
          {phase === 'form' && (
            <button
              type="button"
              onClick={() => {
                setPhase('review');
                setError('');
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 mr-auto"
            >
              {t('projects.signBack')}
            </button>
          )}
          {phase === 'sign' && (
            <button
              type="button"
              onClick={() => {
                setPhase('form');
                setError('');
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 mr-auto"
            >
              {t('projects.signBack')}
            </button>
          )}
          {phase !== 'review' && (
            <button type="button" onClick={handleClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">
              {t('common.cancel')}
            </button>
          )}
          {phase === 'form' && (
            <button
              type="button"
              onClick={() => {
                setError('');
                if (!canContinueForm) {
                  setError(t('projects.signStep1Incomplete'));
                  return;
                }
                setPhase('sign');
              }}
              disabled={!canContinueForm}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              {t('projects.signContinue')}
            </button>
          )}
          {phase === 'sign' && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canContinueForm || submitting}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? '…' : t('projects.signSubmit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
