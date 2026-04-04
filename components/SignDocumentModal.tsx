'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useLanguage } from '@/contexts/LanguageContext';
import { getAdminPanelBaseUrl } from '@/lib/adminPanelUrl';

/** PDF preview uses a native iframe (file URL). Avoids bundling pdf.js in Next — react-pdf/pdfjs-dist often crashes webpack with "Object.defineProperty called on non-object". */

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

type Props = {
  file: SignModalFile;
  /** Full URL for PDF iframe (e.g. with cache-bust); defaults to file.fileUrl */
  pdfSrc?: string;
  projectId: string;
  folderPath: string;
  customerId: string;
  onClose: () => void;
  onSuccess: (result: SignSubmitResult) => void;
};

export default function SignDocumentModal({
  file,
  pdfSrc,
  projectId,
  folderPath,
  customerId,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useLanguage();
  const sigRef = useRef<SignatureCanvas>(null);
  const [signatoryName, setSignatoryName] = useState('');
  const [signatureAddress, setSignatureAddress] = useState('');
  const [signatureConsent, setSignatureConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [locationStatus, setLocationStatus] = useState<
    'idle' | 'pending' | 'success' | 'denied' | 'error'
  >('pending');
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);

  useEffect(() => {
    setLocationStatus('pending');
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocationStatus('error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGps({ lat, lng, accuracy: pos.coords.accuracy });
        setLocationStatus('success');
        fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&format=jsonv2`,
          { headers: { Accept: 'application/json' } }
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((data: { display_name?: string } | null) => {
            if (data?.display_name) setSignatureAddress(data.display_name);
          })
          .catch(() => {});
      },
      () => setLocationStatus('denied'),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }, []);

  const clearSignature = useCallback(() => {
    sigRef.current?.clear();
  }, []);

  const canSubmit =
    signatoryName.trim().length > 0 &&
    signatureConsent &&
    locationStatus !== 'pending' &&
    (locationStatus === 'success' ||
      ((locationStatus === 'denied' || locationStatus === 'error') && signatureAddress.trim().length > 0));

  const handleSubmit = async () => {
    setError('');
    if (!signatoryName.trim()) {
      setError(t('projects.signNameRequired'));
      return;
    }
    if (!signatureConsent) {
      setError(t('projects.signConsentRequired'));
      return;
    }
    if (locationStatus !== 'success' && !signatureAddress.trim()) {
      setError(t('projects.signAddressRequired'));
      return;
    }
    const sig = sigRef.current;
    if (!sig || sig.isEmpty()) {
      setError(t('projects.signSignatureRequired'));
      return;
    }
    let signatureDataUrl: string;
    try {
      const trimmed = sig.getTrimmedCanvas();
      signatureDataUrl = trimmed.toDataURL('image/png');
    } catch {
      signatureDataUrl = sig.getCanvas().toDataURL('image/png');
    }
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
          signatoryName: signatoryName.trim(),
          addressText: signatureAddress.trim(),
          gps: gps ?? undefined,
          signatureDataUrl,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error('fail');
      onSuccess({
        stamped: data?.stamped !== false,
        stampReason: typeof data?.stampReason === 'string' ? data.stampReason : undefined,
      });
      onClose();
    } catch {
      setError(t('messages.error.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">{t('projects.signReportTitle')}</h3>
            <p className="text-xs text-gray-500 mt-0.5 break-all">{file.fileName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 shrink-0"
            aria-label={t('common.close')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          <p className="text-xs text-gray-600">{t('projects.signFlowHint')}</p>

          <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex flex-col">
            <iframe
              title={file.fileName}
              src={pdfSrc ?? file.fileUrl}
              className="w-full min-h-[min(45vh,360px)] border-0 bg-white"
            />
            <div className="px-2 py-1.5 border-t border-gray-200 bg-white flex justify-end">
              <a
                href={pdfSrc ?? file.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                {t('projects.signOpenPdfNewTab')}
              </a>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs px-3 py-2">{error}</div>
          )}

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
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('projects.signLocationLabel')}</label>
            {locationStatus === 'pending' && (
              <p className="text-xs text-gray-500">{t('projects.signLocationPending')}</p>
            )}
            {locationStatus === 'success' && (
              <p className="text-xs text-green-700">{t('projects.signLocationCaptured')}</p>
            )}
            {(locationStatus === 'denied' || locationStatus === 'error') && (
              <p className="text-xs text-amber-700 mb-1">{t('projects.signLocationDenied')}</p>
            )}
            <input
              type="text"
              value={signatureAddress}
              onChange={(e) => setSignatureAddress(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mt-1"
              placeholder={t('projects.signAddressPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('projects.signDrawLabel')} *</label>
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <SignatureCanvas
                ref={sigRef}
                canvasProps={{
                  className: 'w-full h-40 touch-none',
                  style: { width: '100%', height: '160px' },
                }}
                backgroundColor="rgba(255,255,255,1)"
                penColor="#2563eb"
              />
            </div>
            <button
              type="button"
              onClick={clearSignature}
              className="mt-2 text-xs text-indigo-600 hover:text-indigo-800"
            >
              {t('projects.signClear')}
            </button>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={signatureConsent}
              onChange={(e) => setSignatureConsent(e.target.checked)}
              className="mt-1 rounded border-gray-300"
            />
            <span className="text-xs text-gray-700">{t('projects.signConsentText')}</span>
          </label>
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? '…' : t('projects.signSubmit')}
          </button>
        </div>
      </div>
    </div>
  );
}
