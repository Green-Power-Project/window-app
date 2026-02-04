'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLayoutTitle } from '@/contexts/LayoutTitleContext';
import PublicGallery from '@/components/PublicGallery';

/** Customer panel S Gallery – categories list, then gallery images per category. Reuses PublicGallery. */
export default function SGalleryPage() {
  const { t } = useLanguage();
  const { setTitle } = useLayoutTitle();

  useEffect(() => {
    setTitle(t('navigation.sGallery'));
    return () => setTitle(null);
  }, [t, setTitle]);

  return (
    <div className="relative min-h-screen w-full">
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-[0.5]"
        style={{ backgroundImage: 'url(/desktop-bg.png)' }}
        aria-hidden
      />
      <div className="relative z-10 min-h-full">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-5xl mx-auto">
            <PublicGallery standalone basePath="/s-gallery" hideContactAndFooter hasSidebar />
          </div>
        </div>
      </div>
    </div>
  );
}
