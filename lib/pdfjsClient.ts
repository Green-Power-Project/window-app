/**
 * PDF.js must have workerSrc set in the browser before getDocument/render.
 * Without it, worker setup throws and loading fails → iframe fallback → screenshots are blank.
 */
export async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  return pdfjs;
}
