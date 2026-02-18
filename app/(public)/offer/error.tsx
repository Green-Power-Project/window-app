'use client';

import Link from 'next/link';

function isChunkLoadError(error: Error): boolean {
  const msg = error?.message ?? '';
  const name = error?.name ?? '';
  return (
    name === 'ChunkLoadError' ||
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError')
  );
}

export default function OfferError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunk = isChunkLoadError(error);

  function handleRetry() {
    if (isChunk) {
      window.location.reload();
      return;
    }
    reset();
  }

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          {isChunk ? 'Loading failed' : 'Something went wrong'}
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          {isChunk
            ? 'The page could not load. Please try again.'
            : 'An unexpected error occurred. You can try again.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleRetry}
            className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-xl hover:bg-green-power-700"
          >
            {isChunk ? 'Reload page' : 'Try again'}
          </button>
          <Link
            href="/login"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50"
          >
            Back to gallery
          </Link>
        </div>
      </div>
    </div>
  );
}
