'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGalleryCategoryLabels } from '@/lib/galleryCategoryLabels';
import { useContactSettings } from '@/lib/contactSettings';
import { db } from '@/lib/firebase';
import { getGalleryImages, type GalleryImage } from '@/lib/galleryClient';

interface PublicGalleryProps {
  /** When true, used on standalone /gallery page with full-width layout */
  standalone?: boolean;
  /** Base path for category and back links (e.g. "/s-gallery" for customer panel) */
  basePath?: string;
  /** When true, hide contact buttons and copyright footer (e.g. customer panel S Gallery) */
  hideContactAndFooter?: boolean;
  /** When true, lightbox prev/next buttons are offset so prev is not hidden behind the sidebar (customer panel) */
  hasSidebar?: boolean;
}

/** One image per category for the single-row category strip */
function getOneImagePerCategory(images: GalleryImage[], categoryKeys: string[]): { category: string; image: GalleryImage }[] {
  const result: { category: string; image: GalleryImage }[] = [];
  for (const key of categoryKeys) {
    const first = images.find((img) => img.category === key);
    if (first) result.push({ category: key, image: first });
  }
  return result;
}

const DEFAULT_GALLERY_BASE = '/gallery';

export default function PublicGallery({ standalone = false, basePath = DEFAULT_GALLERY_BASE, hideContactAndFooter = false, hasSidebar = false }: PublicGalleryProps) {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const contactLinks = useContactSettings();
  const { categoryKeys, getDisplayName } = useGalleryCategoryLabels();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const isCompactMode = !standalone;
  const categoryFromUrl = standalone ? searchParams.get('category') : null;
  const categoryView = standalone && categoryFromUrl;
  const galleryBase = basePath || DEFAULT_GALLERY_BASE;

  async function loadImages(silent = false) {
    try {
      if (!silent) setLoading(true);
      const list = await getGalleryImages(db);
      setImages(list);
    } catch (error) {
      console.error('Error loading gallery images:', error);
      setImages([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadImages();
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadImages(true);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const categoryRowItems = getOneImagePerCategory(images, categoryKeys);
  const filteredImages = categoryFromUrl
    ? images.filter((img) => img.category === categoryFromUrl)
    : [];

  const goPrev = useCallback(() => {
    if (lightboxIndex === null || filteredImages.length <= 1) return;
    setLightboxIndex((prev) => (prev === null ? null : prev === 0 ? filteredImages.length - 1 : prev - 1));
  }, [lightboxIndex, filteredImages.length]);

  const goNext = useCallback(() => {
    if (lightboxIndex === null || filteredImages.length <= 1) return;
    setLightboxIndex((prev) => (prev === null ? null : prev === filteredImages.length - 1 ? 0 : prev + 1));
  }, [lightboxIndex, filteredImages.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxIndex, goPrev, goNext]);

  const showCategoryArrows = categoryRowItems.length > 5;
  const scrollCategoryStrip = useCallback((direction: 'left' | 'right') => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const step = el.clientWidth;
    el.scrollBy({ left: direction === 'left' ? -step : step, behavior: 'smooth' });
  }, []);

  const glassCardStyle = standalone
    ? { background: 'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(240,247,242,0.45) 100%)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' as const }
    : undefined;

  const renderCategoryCard = (
    { category, image }: { category: string; image: GalleryImage },
    spanTwo?: boolean,
    isCompact?: boolean
  ) => {
    const c = isCompact ?? !standalone;
    const href = `${galleryBase}?category=${encodeURIComponent(category)}`;

    return (
      <Link
        key={category}
        href={href}
        className={`group block focus:outline-none focus:ring-2 focus:ring-green-power-400 focus:ring-offset-1 overflow-hidden transition-all duration-200 ${spanTwo ? 'col-span-2' : ''} ${standalone ? 'rounded-2xl shadow-xl hover:shadow-2xl border-2 border-white/50 card-hover-lift' : 'rounded-2xl border-2 border-white/50 bg-white/40 shadow-xl hover:shadow-2xl hover:border-green-power-200/60 min-w-0 card-hover-lift'} ${!standalone ? 'focus:ring-offset-transparent' : ''}`}
        style={standalone ? glassCardStyle : undefined}
      >
        <div
          className={`relative overflow-hidden min-w-0 rounded-xl bg-gray-100 ${
            standalone ? 'aspect-[4/3]' : c ? 'aspect-[16/10] w-full' : ''
          }`}
        >
          <img
            src={image.url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />

          {/* Title overlay – same for all cards (including last) */}
          {c ? (
            /* Compact (login): gradient overlay + amber "Alle anzeigen" */
            <div className="absolute inset-x-0 bottom-0 text-white">
              <div className="bg-gradient-to-t from-gray-900/90 via-green-power-900/50 to-transparent px-2.5 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-green-power-500 to-teal-500 flex-shrink-0 h-4 w-4 shadow-sm">
                    <svg className="text-white h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                  <p className="font-semibold truncate flex-1 min-w-0 text-xs sm:text-sm">
                    {getDisplayName(category)}
                  </p>
                </div>
                <span className="block text-[10px] sm:text-xs text-amber-300 ml-6 leading-tight font-medium">
                  {t('gallery.viewCategory')}
                </span>
              </div>
            </div>
          ) : (
            /* Standalone: gradient overlay + teal "Alle anzeigen" */
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-900/85 via-green-power-900/50 to-transparent text-white px-2.5 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-green-power-500 to-teal-500 flex-shrink-0 h-4 w-4 shadow-sm">
                  <svg className="text-white h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <p className="font-semibold truncate flex-1 min-w-0 text-sm sm:text-base">{getDisplayName(category)}</p>
              </div>
              <span className="text-xs text-teal-300 mt-0.5 block font-medium">{t('gallery.viewCategory')}</span>
            </div>
          )}
        </div>
      </Link>
    );
  };

  // Show 5 categories at a time. When more than 5, add arrows to scroll (same layout, no new row).
  const embeddedItems = categoryRowItems;
  const gapClass = isCompactMode ? 'gap-2' : 'gap-3 sm:gap-4';
  const gridClass = `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${gapClass} min-w-0 overflow-hidden`;

  const categoryRow = (
    <div className={`flex flex-col min-w-0 overflow-hidden ${isCompactMode ? 'px-3 py-2' : 'px-4 sm:px-6 py-4'}`}>
      {loading ? (
        <div className={`min-w-0 grid ${gridClass}`}>
          {categoryKeys.slice(0, 5).map((_, i) => (
            <div
              key={i}
              className={`min-w-0 rounded-xl bg-gray-200/60 animate-pulse ${isCompactMode ? 'aspect-[16/10]' : 'aspect-[4/3]'}`}
            />
          ))}
        </div>
      ) : categoryRowItems.length === 0 ? (
        <div className={`text-center text-gray-500 ${isCompactMode ? 'py-4 text-xs' : 'py-8 text-sm'}`}>{t('gallery.noImages')}</div>
      ) : showCategoryArrows ? (
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 overflow-hidden">
          <button
            type="button"
            onClick={() => scrollCategoryStrip('left')}
            className="flex-shrink-0 p-2 rounded-full text-green-power-600 hover:bg-green-power-100 hover:text-green-power-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-power-400"
            aria-label={t('common.previous')}
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div
            ref={categoryScrollRef}
            className="flex overflow-x-auto flex-1 min-w-0 scroll-smooth py-1 gap-2 overflow-y-hidden"
            style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
          >
            {embeddedItems.map((item) => (
              <div
                key={item.category}
                className="flex-shrink-0 min-w-[120px] w-[120px] sm:min-w-0 sm:w-[calc(20%-0.4rem)]"
              >
                {renderCategoryCard(item, false, isCompactMode)}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollCategoryStrip('right')}
            className="flex-shrink-0 p-2 rounded-full text-green-power-600 hover:bg-green-power-100 hover:text-green-power-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-power-400"
            aria-label={t('common.next')}
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      ) : isCompactMode ? (
        <div className={gridClass}>
          {embeddedItems.map((item) => renderCategoryCard(item, false, isCompactMode))}
        </div>
      ) : (
        <div className={gridClass}>
          {categoryRowItems.map((item) => renderCategoryCard(item, false, isCompactMode))}
        </div>
      )}
    </div>
  );

  // —— Full list of images for one category (standalone only) ——
  const categoryGridView = categoryView && (
    <div className="px-4 sm:px-6 py-4">
      <Link
        href={galleryBase}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-green-power-700 hover:text-green-power-800 mb-4"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('gallery.backToCategories')}
      </Link>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {getDisplayName(categoryFromUrl)} ({filteredImages.length})
      </h3>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-white/60 animate-pulse" />
          ))}
        </div>
      ) : filteredImages.length === 0 ? (
        <p className="text-gray-500 text-sm py-8">{t('gallery.noImagesInCategory', { category: getDisplayName(categoryFromUrl) })}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {filteredImages.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setLightboxIndex(index)}
              className="block w-full text-left rounded-xl border border-white/50 bg-white/40 shadow-md hover:shadow-xl hover:border-green-power-200/60 transition-all focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 focus:ring-offset-transparent overflow-hidden"
            >
              <div className="relative aspect-square overflow-hidden">
                <img
                  src={image.url}
                  alt={image.title || getDisplayName(image.category)}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 hover:opacity-100 transition-opacity pointer-events-none" />
              </div>
              {image.title && (
                <div className="p-2 bg-white/90 min-h-0">
                  <p className="text-xs font-medium text-gray-900 line-clamp-2 break-words">{image.title}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const headerBlock = (
    <div className={`${isCompactMode ? 'px-3 py-2 border-b border-gray-200/60 flex-shrink-0' : 'px-4 sm:px-6 py-4 border-b border-gray-200/60'}`}>
      <h2 className={`text-gray-900 flex items-center gap-1.5 font-display ${isCompactMode ? 'text-sm font-semibold' : 'text-base sm:text-lg font-bold'}`}>
        <span className="text-amber-500">⭐</span> {t('gallery.title')}
      </h2>
      <p className={`text-gray-600 mt-0.5 ${isCompactMode ? 'text-[10px]' : 'text-xs'}`}>{t('gallery.subtitle')}</p>
    </div>
  );

  const contactBlock = !categoryView && !hideContactAndFooter && (
    <div className={isCompactMode ? 'px-3 py-2 border-t border-gray-200/60 text-center flex-shrink-0' : 'px-4 sm:px-6 py-4 border-t border-gray-200/60 text-center'}>
      <p className={`text-gray-600 mb-2 ${isCompactMode ? 'text-[10px] mb-1.5' : 'text-xs mb-3'}`}>{t('gallery.contactPrompt')}</p>
      <div className={`flex justify-center flex-wrap ${isCompactMode ? 'gap-2' : 'gap-3'}`}>
        <a href={contactLinks.phone} className={`inline-flex items-center gap-1.5 bg-gradient-to-r from-green-power-500 to-green-power-600 text-white rounded-xl hover:from-green-power-600 hover:to-green-power-700 font-medium shadow-lg transition-all hover:scale-[1.02] ${isCompactMode ? 'px-3 py-2 text-xs sm:text-sm' : 'px-4 py-2.5 text-sm'}`}>
          {t('gallery.contact')}
        </a>
        <a href={contactLinks.email} className={`inline-flex items-center gap-1.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-xl hover:from-teal-600 hover:to-teal-600 font-medium shadow-lg transition-all hover:scale-[1.02] ${isCompactMode ? 'px-3 py-2 text-xs sm:text-sm' : 'px-4 py-2.5 text-sm'}`}>
          {t('gallery.email')}
        </a>
        <a href={contactLinks.whatsApp} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 bg-[#25D366] text-white rounded-xl hover:opacity-95 hover:scale-[1.02] font-medium shadow-lg transition-all ${isCompactMode ? 'px-3 py-2 text-xs sm:text-sm' : 'px-4 py-2.5 text-sm'}`}>
          WhatsApp
        </a>
        <a href={contactLinks.website} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 bg-gray-600 text-white rounded-xl hover:bg-gray-700 hover:scale-[1.02] font-medium shadow-lg transition-all ${isCompactMode ? 'px-3 py-2 text-xs sm:text-sm' : 'px-4 py-2.5 text-sm'}`}>
          {t('gallery.website')}
        </a>
      </div>
    </div>
  );

  const copyrightFooter = standalone && !categoryView && !hideContactAndFooter && (
    <p className="text-center text-gray-600 text-xs py-4 border-t border-gray-200/60">
      {t('login.copyright', { year: new Date().getFullYear() })}
    </p>
  );

  const inner = (
    <>
      {headerBlock}
      {categoryView ? categoryGridView : categoryRow}
      {contactBlock}
      {copyrightFooter}
    </>
  );

  if (!standalone) {
    return (
      <div className="flex flex-col min-w-0 w-full max-w-full flex-shrink-0">
        {inner}
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div
        className="rounded-2xl overflow-hidden border-2 border-white/70"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(240,247,242,0.5) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: '0 0 50px -8px rgba(72, 164, 127, 0.28), 0 8px 32px rgba(0,0,0,0.08)',
        }}
      >
        {inner}
      </div>

      {/* Lightbox – for category grid view */}
      {categoryView && lightboxIndex !== null && filteredImages[lightboxIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setLightboxIndex(null)}>
          <button type="button" onClick={() => setLightboxIndex(null)} className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-lg z-10" aria-label={t('common.close')}>
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {filteredImages.length > 1 && (
            <>
              <button type="button" onClick={(e) => { e.stopPropagation(); goPrev(); }} className={`absolute top-1/2 -translate-y-1/2 p-2 text-white hover:bg-white/10 rounded-lg z-10 ${hasSidebar ? 'left-4 lg:left-[17rem]' : 'left-4'}`} aria-label={t('common.previous')}>
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); goNext(); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white hover:bg-white/10 rounded-lg z-10" aria-label={t('common.next')}>
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
          <div className="relative max-w-5xl w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={filteredImages[lightboxIndex].url}
              alt={filteredImages[lightboxIndex].title || getDisplayName(filteredImages[lightboxIndex].category)}
              className="max-h-[75vh] w-auto object-contain rounded-lg"
            />
            <div className="mt-3 w-full max-w-2xl px-4 py-2 rounded-lg bg-black/70 text-white text-center">
              {filteredImages[lightboxIndex].title && (
                <p className="font-medium text-sm sm:text-base break-words">{filteredImages[lightboxIndex].title}</p>
              )}
              <p className="text-xs sm:text-sm opacity-90 mt-0.5">{getDisplayName(filteredImages[lightboxIndex].category)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
