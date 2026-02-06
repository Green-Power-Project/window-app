'use client';

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 bg-transparent">
      <div className="text-center max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('projectError.title')}</h2>
        <p className="text-sm text-gray-600 mb-6">
          {t('projectError.description')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-xl hover:bg-green-power-700"
          >
            {t('projectError.tryAgain')}
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50"
          >
            {t('navigation.dashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}
