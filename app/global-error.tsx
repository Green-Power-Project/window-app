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

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('GlobalError:', error);
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
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Grün Power – Fehler</title>
      </head>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f5f5f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 400 }}>
          <h1 style={{ fontSize: 20, color: '#1a1a1a', marginBottom: 8 }}>
            {isChunk ? 'Laden fehlgeschlagen' : 'Es ist ein Fehler aufgetreten'}
          </h1>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>
            {isChunk
              ? 'Die App konnte nicht geladen werden. Dies passiert häufig beim ersten Öffnen. Bitte versuchen Sie es erneut.'
              : 'Ein unerwarteter Fehler ist aufgetreten. Sie können es erneut versuchen.'}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 600,
              color: '#fff',
              background: '#4d7c59',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
            >
            {isChunk ? 'Seite neu laden' : 'Erneut versuchen'}
          </button>
        </div>
      </body>
    </html>
  );
}
