'use client';

import Link from 'next/link';
import PublicGallery from '@/components/PublicGallery';

/** Public gallery page – no login required. Accessible at /gallery */
export default function GalleryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-power-50 via-white to-green-power-50">
      {/* Minimal public header */}
      <header className="sticky top-0 z-10 border-b border-gray-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/login"
            className="flex items-center gap-2 text-gray-700 hover:text-green-power-700 transition-colors"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm border border-gray-100 p-1.5">
              <img src="/logo.png" alt="Grün Power" className="h-full w-full object-contain" />
            </div>
            <span className="font-semibold text-gray-900">Grün Power</span>
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-green-power-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-power-700 transition-colors"
          >
            Customer Portal
          </Link>
        </div>
      </header>

      <main>
        <PublicGallery standalone />
      </main>
    </div>
  );
}
