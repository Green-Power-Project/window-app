'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGalleryCategoryLabels } from '@/lib/galleryCategoryLabels';
import { useContactSettings } from '@/lib/contactSettings';

/** When embedded on login page: show only this many images (one row) */
const PREVIEW_ROW_COUNT = 4;

interface GalleryImage {
  id: string;
  url: string;
  category: string;
  title?: string;
}

interface PublicGalleryProps {
  /** When true, used on standalone /gallery page with full-width layout and extra spacing */
  standalone?: boolean;
}

export default function PublicGallery({ standalone = false }: PublicGalleryProps) {
  const { t } = useLanguage();
  const contactLinks = useContactSettings();
  const { categoryKeys, getDisplayName } = useGalleryCategoryLabels();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  async function loadImages(silent = false) {
    try {
      if (!silent) setLoading(true);
      // Always fetch fresh from server: no cache, no-store, and cache-bust query
      const response = await fetch(`/api/gallery/images?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      const galleryImages = await response.json();
      // Always replace state with API response (including []) so deleted gallery data never persists
      setImages(Array.isArray(galleryImages) ? galleryImages : []);
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

  // Refetch when tab becomes visible so admin updates appear without manual refresh
  useEffect(() => {
    function onVisibilityChange() {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadImages(true);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const filteredImages =
    selectedCategory === 'all'
      ? images
      : images.filter((img) => img.category === selectedCategory);

  const goPrev = useCallback(() => {
    if (lightboxIndex === null || filteredImages.length <= 1) return;
    setLightboxIndex((prev) => {
      if (prev === null) return null;
      return prev === 0 ? filteredImages.length - 1 : prev - 1;
    });
  }, [lightboxIndex, filteredImages.length]);

  const goNext = useCallback(() => {
    if (lightboxIndex === null || filteredImages.length <= 1) return;
    setLightboxIndex((prev) => {
      if (prev === null) return null;
      return prev === filteredImages.length - 1 ? 0 : prev + 1;
    });
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

  const containerClass = standalone
    ? 'w-full max-w-6xl mx-auto px-4 py-8 sm:px-6 sm:py-10'
    : 'w-full max-w-5xl mx-auto px-4 py-6 sm:px-5 sm:py-6';

  const displayImages = standalone ? filteredImages : filteredImages.slice(0, PREVIEW_ROW_COUNT);
  const hasMoreImages = !standalone && filteredImages.length > PREVIEW_ROW_COUNT;

  return (
    <div className={containerClass}>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Header strip – aligned with admin / audit style */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
            ⭐ {t('gallery.title')}
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">{t('gallery.subtitle')}</p>
        </div>

        {/* Filter strip */}
        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 bg-gray-50/60">
          <label className="block text-xs font-medium text-gray-700 mb-2">{t('gallery.filterByCategory')}</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-green-power-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-green-power-300'
              }`}
            >
              {t('gallery.allCategories')} ({images.length})
            </button>
            {categoryKeys.map((category) => {
              const count = images.filter((img) => img.category === category).length;
              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategory === category
                      ? 'bg-green-power-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-green-power-300'
                  }`}
                >
                  {getDisplayName(category)} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content – one row when embedded, full grid on standalone. No flex-1 so footer stays visible. */}
        <div className="px-4 sm:px-6 py-4">
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: standalone ? 8 : PREVIEW_ROW_COUNT }).map((_, index) => (
            <div
              key={index}
              className="aspect-square rounded-xl bg-gray-200 animate-pulse"
            />
          ))}
        </div>
      ) : displayImages.length === 0 ? (
        <div className="text-center py-12 sm:py-16 rounded-xl bg-gray-50 border border-gray-100">
          <div className="text-gray-400 text-5xl sm:text-6xl mb-3">📷</div>
          <p className="text-gray-600 font-medium text-sm sm:text-base mb-2">
            {selectedCategory === 'all'
              ? t('gallery.noImages')
              : t('gallery.noImagesInCategory', { category: getDisplayName(selectedCategory) })}
          </p>
          {selectedCategory !== 'all' && (
            <button
              onClick={() => setSelectedCategory('all')}
              className="text-green-power-600 hover:text-green-power-700 font-medium text-sm"
            >
              {t('gallery.allCategories')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {displayImages.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setLightboxIndex(index)}
                className="group relative aspect-square overflow-hidden rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 text-left focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2"
              >
                <img
                  src={image.url}
                  alt={image.title || `${image.category} - ${image.id}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                    <p className="text-sm font-medium truncate">{getDisplayName(image.category)}</p>
                    {image.title && (
                      <p className="text-xs opacity-90 truncate">{image.title}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {!standalone && (
            <div className="mt-4 flex justify-center shrink-0">
              <Link
                href="/gallery"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-power-600 text-white rounded-lg hover:bg-green-power-700 transition-colors text-sm font-medium"
              >
                {t('gallery.openGallery')}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </>
      )}
        </div>

        {/* Footer – contact */}
        <div className="px-4 sm:px-6 py-4 border-t border-gray-100 bg-gray-50/40 text-center">
          <p className="text-xs sm:text-sm text-gray-600 mb-3">{t('gallery.contactPrompt')}</p>
          <div className="flex justify-center gap-3 flex-wrap">
            <a
              href={contactLinks.phone}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-power-600 text-white rounded-lg hover:bg-green-power-700 transition-colors text-xs sm:text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              {t('gallery.contact')}
            </a>
            <a
              href={contactLinks.email}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-xs sm:text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {t('gallery.email')}
            </a>
            <a
              href={contactLinks.whatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#25D366] text-white rounded-lg hover:opacity-90 transition-colors text-xs sm:text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </a>
            <a
              href={contactLinks.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-xs sm:text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              {t('gallery.website')}
            </a>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && filteredImages[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
            aria-label={t('common.close')}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {filteredImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
                aria-label={t('common.previous')}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
                aria-label={t('common.next')}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
          <div
            className="relative max-w-5xl max-h-[85vh] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={filteredImages[lightboxIndex].url}
              alt={filteredImages[lightboxIndex].title || filteredImages[lightboxIndex].category}
              className="max-h-[85vh] w-auto mx-auto object-contain rounded-lg"
            />
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent rounded-b-lg text-white text-center">
              {filteredImages[lightboxIndex].title && (
                <p className="font-medium">{filteredImages[lightboxIndex].title}</p>
              )}
              <p className="text-sm opacity-90">{getDisplayName(filteredImages[lightboxIndex].category)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
