'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { getAndClearOfferScreenshot } from '@/lib/offerScreenshotStore';
import { getAdminPanelBaseUrl } from '@/lib/adminPanelUrl';

async function uploadFileToCloudinary(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'offers/customer-uploads');
  const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Upload failed');
  }
  const data = await res.json();
  if (data.secure_url) return data.secure_url;
  throw new Error('Upload failed');
}

export default function ScreenshotRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const debug = searchParams.get('debug') === '1';
  const [screenshot, setScreenshot] = useState<{ file: File; previewUrl: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{ fileSize: number; imgLoad: 'pending' | 'ok' | 'error'; imgW?: number; imgH?: number } | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [projectNote, setProjectNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [previewExpanded, setPreviewExpanded] = useState(false);

  useEffect(() => {
    if (debug && typeof window !== 'undefined') (window as any).__DEBUG_SCREENSHOT = true;
    const data = getAndClearOfferScreenshot();
    if (data) {
      if (debug) {
        console.debug('[screenshot-request] got screenshot from store', { fileSize: data.file.size, type: data.file.type });
        setDebugInfo({ fileSize: data.file.size, imgLoad: 'pending' });
      }
      const previewUrl = URL.createObjectURL(data.file);
      setScreenshot({ file: data.file, previewUrl });
      setReady(true);
    } else {
      if (debug) console.debug('[screenshot-request] no screenshot in store');
      setReady(true);
    }
  }, [debug]);

  useEffect(() => {
    if (!ready) return;
    if (!screenshot) {
      router.replace('/offer');
    }
  }, [ready, screenshot, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!screenshot) return;

    const trim = (s: string) => s.trim();
    if (!trim(firstName) || !trim(lastName) || !trim(email) || !trim(mobile) || !trim(address)) {
      setSubmitStatus('error');
      return;
    }

    const base = getAdminPanelBaseUrl();
    if (!base) {
      setSubmitStatus('error');
      return;
    }

    setSubmitting(true);
    setSubmitStatus('idle');
    try {
      const photoUrl = await uploadFileToCloudinary(screenshot.file);
      if (screenshot.previewUrl) URL.revokeObjectURL(screenshot.previewUrl);

      const res = await fetch(`${base}/api/offers/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: trim(firstName),
          lastName: trim(lastName),
          email: trim(email),
          mobile: trim(mobile),
          address: trim(address),
          projectNote: trim(projectNote) || undefined,
          items: [
            {
              itemType: 'catalogue',
              imageUrl: '',
              itemName: t('offer.screenshotItemName'),
              color: '',
              quantityMeters: '',
              quantityPieces: '',
              photoUrls: [photoUrl],
            },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSubmitStatus('success');
        setScreenshot(null);
      } else {
        setSubmitStatus('error');
      }
    } catch {
      setSubmitStatus('error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-power-50">
        <p className="text-gray-600">{t('common.loading')}</p>
      </div>
    );
  }

  if (!screenshot) {
    return null;
  }

  if (submitStatus === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-green-power-50">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('offer.successTitle')}</h1>
          <p className="text-gray-600 text-sm mb-6">{t('offer.successMessage')}</p>
          <Link
            href="/offer"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-white w-full"
            style={{ background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' }}
          >
            {t('offer.successClose')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-power-50 py-6 px-4">
      <div className="max-w-lg mx-auto">
        <Link
          href="/offer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-green-power-700 mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('common.back')}
        </Link>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h1 className="text-xl font-bold text-gray-900">{t('offer.screenshotRequestTitle')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('offer.screenshotRequestSubtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('offer.screenshotAttached')}</label>
              {debug && debugInfo && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs font-mono text-amber-900 mb-2">
                  <strong>Debug:</strong> fileSize={debugInfo.fileSize} bytes | imgLoad={debugInfo.imgLoad}
                  {debugInfo.imgW != null && ` | image=${debugInfo.imgW}×${debugInfo.imgH}`}
                </div>
              )}
              <button
                type="button"
                onClick={() => setPreviewExpanded(true)}
                className="w-full rounded-xl border-2 border-gray-200 overflow-hidden bg-gray-100 aspect-video max-h-48 flex items-center justify-center focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 focus:outline-none min-h-[120px]"
              >
                <img
                  src={screenshot.previewUrl}
                  alt=""
                  className="max-w-full max-h-full w-full h-full object-contain pointer-events-none"
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (debug) {
                      setDebugInfo((prev) => prev ? { ...prev, imgLoad: 'ok', imgW: img.naturalWidth, imgH: img.naturalHeight } : null);
                      console.debug('[screenshot-request] img onLoad', { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
                    }
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    if (debug) {
                      setDebugInfo((prev) => prev ? { ...prev, imgLoad: 'error' } : null);
                      console.error('[screenshot-request] img onError – preview URL failed to load');
                    }
                  }}
                />
              </button>
              <p className="text-xs text-gray-500 mt-1">{t('offer.screenshotClickToView')}</p>

              {previewExpanded && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                  role="dialog"
                  aria-modal="true"
                  onClick={() => setPreviewExpanded(false)}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewExpanded(false)}
                    className="absolute top-3 right-3 p-2 rounded-full bg-white/90 text-gray-800 hover:bg-white"
                    aria-label={t('common.close')}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <img
                    src={screenshot.previewUrl}
                    alt=""
                    className="max-w-full max-h-full object-contain"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="sr-firstName" className="block text-sm font-medium text-gray-700 mb-1">{t('offer.firstName')} *</label>
                <input
                  id="sr-firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder={t('offer.firstNamePlaceholder')}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 text-gray-900"
                  required
                />
              </div>
              <div>
                <label htmlFor="sr-lastName" className="block text-sm font-medium text-gray-700 mb-1">{t('offer.lastName')} *</label>
                <input
                  id="sr-lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder={t('offer.lastNamePlaceholder')}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 text-gray-900"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="sr-email" className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                id="sr-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('offer.emailPlaceholder')}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 text-gray-900"
                required
              />
            </div>

            <div>
              <label htmlFor="sr-mobile" className="block text-sm font-medium text-gray-700 mb-1">{t('offer.mobile')} *</label>
              <input
                id="sr-mobile"
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder={t('offer.mobilePlaceholder')}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 text-gray-900"
                required
              />
            </div>

            <div>
              <label htmlFor="sr-address" className="block text-sm font-medium text-gray-700 mb-1">{t('offer.address')} *</label>
              <input
                id="sr-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t('offer.addressPlaceholder')}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 text-gray-900"
                required
              />
            </div>

            <div>
              <label htmlFor="sr-note" className="block text-sm font-medium text-gray-700 mb-1">{t('offer.projectNote')}</label>
              <textarea
                id="sr-note"
                value={projectNote}
                onChange={(e) => setProjectNote(e.target.value)}
                placeholder={t('offer.projectNotePlaceholder')}
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 text-gray-900 resize-none"
              />
            </div>

            {submitStatus === 'error' && (
              <p className="text-sm text-red-600">{t('offer.errorMessage')}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-xl font-semibold text-white disabled:opacity-70 touch-manipulation"
              style={{ background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' }}
            >
              {submitting ? t('offer.submitting') : t('offer.submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
