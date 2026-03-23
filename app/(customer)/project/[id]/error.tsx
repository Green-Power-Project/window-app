'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import deCommon from '@/locales/de/common.json';

/** Static copy so this boundary still renders if a provider above fails. */
const pe = deCommon.projectError;
const dashboardLabel = deCommon.navigation.dashboard;

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Project route error:', error?.message ?? error, error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 bg-transparent">
      <div className="text-center max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{pe.title}</h2>
        <p className="text-sm text-gray-600 mb-6">{pe.description}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-xl hover:bg-green-power-700"
          >
            {pe.tryAgain}
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50"
          >
            {dashboardLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
