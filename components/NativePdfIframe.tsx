'use client';

type Props = {
  src: string;
  /** Accessible name; defaults to "PDF". */
  title?: string;
  className?: string;
};

export default function NativePdfIframe({ src, title = 'PDF', className = '' }: Props) {
  return (
    <div className={`w-full max-w-full rounded-lg border border-gray-200 bg-white p-4 ${className}`.trim()}>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={title}
        className="inline-flex items-center px-3 py-2 rounded-md bg-green-power-600 text-white text-sm font-medium hover:bg-green-power-700"
      >
        Open PDF
      </a>
    </div>
  );
}
