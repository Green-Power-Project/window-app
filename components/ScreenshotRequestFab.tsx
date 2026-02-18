'use client';

import { useState, type RefObject } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { captureViewport } from '@/lib/screenshotCapture';
import { setOfferScreenshot } from '@/lib/offerScreenshotStore';

type Props = {
  /** When provided (e.g. on PDF view page), only this element is captured (PDF area only). */
  captureTargetRef?: RefObject<HTMLElement | null>;
};

/** Floating button to capture current screen (or target element), show confirm dialog, then open screenshot quote request form. */
export default function ScreenshotRequestFab({ captureTargetRef }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [capturing, setCapturing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [captured, setCaptured] = useState<{ file: File; previewUrl: string } | null>(null);

  const isLogin = pathname === '/login' || pathname?.startsWith('/login/');
  if (isLogin) return null;

  const handleCapture = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      const target = captureTargetRef?.current ?? undefined;
      const { file, previewUrl } = await captureViewport(target);
      setCaptured({ file, previewUrl });
      setConfirmOpen(true);
    } catch (e) {
      console.error('Screenshot capture failed:', e);
    } finally {
      setCapturing(false);
    }
  };

  const handleConfirmYes = () => {
    if (captured) {
      setOfferScreenshot({ file: captured.file, previewUrl: captured.previewUrl });
      setCaptured(null);
      setConfirmOpen(false);
      router.push('/offer/screenshot-request');
    }
  };

  const handleConfirmNo = () => {
    if (captured?.previewUrl) URL.revokeObjectURL(captured.previewUrl);
    setCaptured(null);
    setConfirmOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleCapture}
        disabled={capturing}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full text-white font-semibold text-sm shadow-lg hover:shadow-xl transition-all touch-manipulation min-h-[48px] disabled:opacity-70"
        style={{
          background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
          boxShadow: '0 4px 14px rgba(93, 138, 106, 0.4)',
        }}
        aria-label={t('offer.screenshotAndRequest', 'Screenshot & request quote')}
        title={t('offer.screenshotAndRequest', 'Screenshot & request quote')}
      >
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 17v2a2 2 0 01-2 2H7a2 2 0 01-2-2v-2" />
        </svg>
        <span className="hidden sm:inline">
          {capturing ? t('common.loading') : t('offer.screenshotAndRequest', 'Screenshot & request quote')}
        </span>
      </button>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="screenshot-confirm-title">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 flex flex-col gap-4">
            <h2 id="screenshot-confirm-title" className="text-lg font-semibold text-gray-900">
              {t('offer.screenshotConfirmTitle', 'Request a quote?')}
            </h2>
            <p className="text-gray-600 text-sm">
              {t('offer.screenshotConfirmMessage', 'Do you want to make a request for the quote? You can add your details and submit the form with this screenshot attached.')}
            </p>
            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={handleConfirmNo}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 touch-manipulation"
              >
                {t('offer.screenshotConfirmNo', 'No')}
              </button>
              <button
                type="button"
                onClick={handleConfirmYes}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white touch-manipulation"
                style={{ background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' }}
              >
                {t('offer.screenshotConfirmYes', 'Yes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
