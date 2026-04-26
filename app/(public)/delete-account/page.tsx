'use client';

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

export default function DeleteAccountPage() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-1 flex-col relative overflow-y-auto w-full">
      <div className="relative z-10 flex flex-1 flex-col w-full px-3 sm:px-4 pt-3 pb-3">
        <div className="w-full max-w-4xl mx-auto rounded-2xl border border-white/80 bg-white/80 backdrop-blur p-6 sm:p-8 space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">{t('legal.deleteAccountTitle')}</h1>
          <p className="text-sm text-gray-700">{t('legal.deleteAccountIntro')}</p>
          <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
            <li>Open the Green Power app.</li>
            <li>{t('legal.deleteStepGoProfile')}</li>
            <li>Click on &quot;Delete Account&quot;.</li>
          </ul>
          <p className="text-sm text-gray-700">
            Alternatively, you can request account deletion by emailing:{' '}
            <a href="mailto:info@gruen-power.de" className="text-green-power-700 hover:underline">
              info@gruen-power.de
            </a>
          </p>
          <p className="text-sm text-gray-700">
            Please include your registered email or phone number.
          </p>
          <p className="text-sm text-gray-700">{t('legal.deleteTimeline')}</p>

          <div className="pt-4 border-t border-gray-100 text-sm text-gray-600 flex flex-wrap gap-3">
            <Link href="/privacy-policy" className="text-green-power-700 hover:underline">
              {t('legal.privacyTitle')}
            </Link>
            <span aria-hidden>-</span>
            <Link href="/terms-and-conditions" className="text-green-power-700 hover:underline">
              {t('legal.termsTitle')}
            </Link>
            <span aria-hidden>-</span>
            <Link href="/login" className="text-green-power-700 hover:underline">
              {t('login.title')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

