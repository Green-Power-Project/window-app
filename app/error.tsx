'use client';

import { useEffect } from 'react';

function isChunkLoadError(error: Error): boolean {
  const msg = error?.message ?? '';
  const name = error?.name ?? '';
  return (
    name === 'ChunkLoadError' ||
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError')
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  const isChunk = isChunkLoadError(error);

  function handleRetry() {
    if (isChunk) {
      window.location.reload();
      return;
    }
    reset();
  }

  return (
    <div className="min-h-[40vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          {isChunk ? 'Loading failed' : 'Something went wrong'}
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          {isChunk
            ? 'The page could not load. Please try again.'
            : 'An unexpected error occurred. You can try again.'}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="px-5 py-2.5 bg-green-power-500 text-white text-sm font-medium rounded-lg hover:bg-green-power-600 transition-colors"
        >
          {isChunk ? 'Reload page' : 'Try again'}
        </button>
      </div>
    </div>
  );
}
