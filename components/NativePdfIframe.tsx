'use client';

type Props = {
  src: string;
  /** Accessible name; defaults to "PDF". */
  title?: string;
  className?: string;
};

/**
 * Renders a PDF with the browser’s built-in viewer (iframe). Prefer this for viewing
 * across devices when PDF.js is unreliable (CORS, workers, mobile WebViews).
 */
export default function NativePdfIframe({ src, title = 'PDF', className = '' }: Props) {
  return (
    <iframe
      src={src}
      title={title}
      className={`block w-full max-w-full border-0 bg-white [color-scheme:light] ${className}`.trim()}
    />
  );
}
