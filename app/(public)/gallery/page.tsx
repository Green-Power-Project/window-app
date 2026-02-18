'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useLanguage } from '@/contexts/LanguageContext';
import PublicGallery from '@/components/PublicGallery';

/** Public gallery page – background from (public) layout; no Suspense to avoid content swap blink. */
export default function GalleryPage() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-1 flex-col relative overflow-hidden w-full">
      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-6 max-w-5xl mx-auto w-full flex-shrink-0">
        <Link href="/login" className="flex items-center gap-2 text-white drop-shadow-lg hover:opacity-90 transition-opacity">
          <Image src="/logo.png" alt="" width={28} height={28} className="object-contain" />
          <span className="font-bold tracking-tight text-white">Grün Power</span>
        </Link>
        <Link
          href="/login"
          className="rounded-xl bg-gradient-to-r from-white/95 to-green-power-50/90 backdrop-blur-sm text-green-power-700 px-4 py-2 text-sm font-semibold hover:from-white hover:to-white border border-white/50 shadow-lg transition-all hover:scale-[1.02]"
        >
          {t('navigation.customerPortal')}
        </Link>
      </header>

      <main className="relative z-10 flex-1 px-4 pb-8 sm:px-6 flex justify-center min-w-0">
        <div className="w-full">
          <PublicGallery standalone />
        </div>
      </main>

      <p className="relative z-10 text-center text-[10px] sm:text-xs text-white/90 pb-3 font-medium drop-shadow flex-shrink-0">
        {t('login.copyright', { year: new Date().getFullYear() })}
      </p>
    </div>
  );
}
