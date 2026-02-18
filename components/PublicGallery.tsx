'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGalleryCategoryLabels } from '@/lib/galleryCategoryLabels';
import { useContactSettings } from '@/lib/contactSettings';
import { db } from '@/lib/firebase';
import { getGalleryImages, type GalleryImage } from '@/lib/galleryClient';
import { OFFERS_CATEGORY_KEY } from '@/lib/galleryConstants';
import { getAdminPanelBaseUrl } from '@/lib/adminPanelUrl';

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
  const [mounted, setMounted] = useState(false);

  // Offer popup state (customer)
  type OfferCartItem = {
    imageId: string;
    imageUrl: string;
    itemName: string;
    color: string;
    quantityMeters?: string;
    quantityPieces?: string;
  };
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerPickImage, setOfferPickImage] = useState<GalleryImage | null>(null);
  const [offerPickColor, setOfferPickColor] = useState('');
  const [offerPickMeters, setOfferPickMeters] = useState('');
  const [offerPickPieces, setOfferPickPieces] = useState('');
  const [offerPickError, setOfferPickError] = useState<string | null>(null);
  const [offerPickDescExpanded, setOfferPickDescExpanded] = useState(false);
  const [offerCart, setOfferCart] = useState<OfferCartItem[]>([]);
  const [offerFirstName, setOfferFirstName] = useState('');
  const [offerLastName, setOfferLastName] = useState('');
  const [offerEmail, setOfferEmail] = useState('');
  const [offerMobile, setOfferMobile] = useState('');
  const [offerAddress, setOfferAddress] = useState('');
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [offerSubmitError, setOfferSubmitError] = useState<string | null>(null);
  const [offerSuccessOpen, setOfferSuccessOpen] = useState(false);
  const [offerFieldErrors, setOfferFieldErrors] = useState<Record<string, string>>({});

  const isCompactMode = !standalone;
  const categoryFromUrl = standalone ? searchParams.get('category') : null;
  const categoryView = standalone && categoryFromUrl;
  const galleryBase = basePath || DEFAULT_GALLERY_BASE;

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const publicCategoryKeys = categoryKeys.filter((k) => k !== OFFERS_CATEGORY_KEY);
  const publicImages = images.filter((img) => img.category !== OFFERS_CATEGORY_KEY);
  const categoryRowItems = getOneImagePerCategory(publicImages, publicCategoryKeys);
  const filteredImages = categoryFromUrl
    ? publicImages.filter((img) => img.category === categoryFromUrl)
    : [];

  const offerImages = images.filter((img) => img.category === OFFERS_CATEGORY_KEY || img.offerEligible === true);

  function resetOfferState() {
    setOfferPickImage(null);
    setOfferPickColor('');
    setOfferPickMeters('');
    setOfferPickPieces('');
    setOfferPickError(null);
    setOfferPickDescExpanded(false);
    setOfferCart([]);
    setOfferFirstName('');
    setOfferLastName('');
    setOfferEmail('');
    setOfferMobile('');
    setOfferAddress('');
    setOfferSubmitting(false);
    setOfferSubmitError(null);
    setOfferSuccessOpen(false);
    setOfferFieldErrors({});
  }

  function openOfferPopup() {
    setOfferSubmitError(null);
    setOfferSuccessOpen(false);
    setOfferOpen(true);
  }

  function closeOfferPopup() {
    if (offerSubmitting) return;
    setOfferOpen(false);
    resetOfferState();
  }

  function openOfferPick(img: GalleryImage) {
    setOfferPickError(null);
    setOfferPickDescExpanded(false);
    setOfferPickImage(img);
    const opts = img.offerColorOptions ?? [];
    setOfferPickColor(opts[0] ?? '');
    setOfferPickMeters('');
    setOfferPickPieces('');
  }

  function closeOfferPick() {
    setOfferPickImage(null);
    setOfferPickError(null);
    setOfferPickDescExpanded(false);
  }

  function digitsOnly(s: string) {
    return s.replace(/\D+/g, '');
  }

  function addOfferItemToCart() {
    if (!offerPickImage) return;
    const meters = offerPickMeters.trim();
    const pieces = offerPickPieces.trim();
    const hasMeters = meters !== '' && Number(meters) > 0;
    const hasPieces = pieces !== '' && Number(pieces) > 0;
    if (!hasMeters && !hasPieces) {
      setOfferPickError(t('offer.validationQuantity'));
      return;
    }
    const color =
      (offerPickImage.offerColorOptions?.length ? offerPickColor.trim() : '') ||
      (offerPickImage.offerColorOptions?.[0] ?? '');
    setOfferCart((prev) => [
      ...prev,
      {
        imageId: offerPickImage.id,
        imageUrl: offerPickImage.url,
        itemName: offerPickImage.title ?? getDisplayName(offerPickImage.category),
        color,
        quantityMeters: hasMeters ? meters : undefined,
        quantityPieces: hasPieces ? pieces : undefined,
      },
    ]);
    closeOfferPick();
  }

  function removeOfferItem(index: number) {
    setOfferCart((prev) => prev.filter((_, i) => i !== index));
  }

  function validateOfferForm(): boolean {
    const errs: Record<string, string> = {};
    if (!offerCart.length) errs.cart = t('offer.validationCart');
    if (!offerFirstName.trim()) errs.firstName = t('offer.validationRequired');
    if (!offerLastName.trim()) errs.lastName = t('offer.validationRequired');
    if (!offerEmail.trim()) errs.email = t('offer.validationRequired');
    if (!offerMobile.trim()) errs.mobile = t('offer.validationRequired');
    if (!offerAddress.trim()) errs.address = t('offer.validationRequired');

    const mobileDigits = offerMobile.replace(/[^\d]/g, '');
    if (offerMobile.trim() && mobileDigits.length < 6) errs.mobile = t('offer.validationMobile');

    setOfferFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submitOfferRequest() {
    if (offerSubmitting) return;
    setOfferSubmitError(null);
    if (!validateOfferForm()) return;
    const base = getAdminPanelBaseUrl();
    if (!base) {
      setOfferSubmitError(t('offer.errorMessage'));
      return;
    }
    setOfferSubmitting(true);
    try {
      const res = await fetch(`${base}/api/offers/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: offerFirstName.trim(),
          lastName: offerLastName.trim(),
          email: offerEmail.trim(),
          mobile: offerMobile.trim(),
          address: offerAddress.trim(),
          items: offerCart.map((it) => ({
            imageId: it.imageId,
            imageUrl: it.imageUrl,
            itemName: it.itemName,
            color: it.color,
            quantityMeters: it.quantityMeters,
            quantityPieces: it.quantityPieces,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setOfferSuccessOpen(true);
      } else {
        setOfferSubmitError(t('offer.errorMessage'));
      }
    } catch {
      setOfferSubmitError(t('offer.errorMessage'));
    } finally {
      setOfferSubmitting(false);
    }
  }

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

  // Use a consistent 4‑card grid layout (no horizontal arrows) on both login and full gallery.
  const showCategoryArrows = false;
  const scrollCategoryStrip = useCallback((direction: 'left' | 'right') => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const step = el.clientWidth;
    el.scrollBy({ left: direction === 'left' ? -step : step, behavior: 'smooth' });
  }, []);

  const renderCategoryCard = (
    { category, image }: { category: string; image: GalleryImage },
    spanTwo?: boolean,
    isCompact?: boolean
  ) => {
    const c = isCompact ?? !standalone;
    const href = `${galleryBase}?category=${encodeURIComponent(category)}`;

    /* Offer-style card: white card, image on top, title + green button below (no overlay, no checkmark) */
    return (
      <Link
        key={category}
        href={href}
        className={`group flex flex-col focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 overflow-hidden transition-all duration-300 ${spanTwo ? 'col-span-2' : ''} rounded-xl bg-white border border-gray-100 min-w-0 hover:shadow-lg active:scale-[0.98]`}
        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <div className="relative overflow-hidden bg-gray-100 flex-shrink-0 aspect-[4/3] w-full max-h-32 sm:max-h-36">
          <img
            src={image.url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        </div>
        <div
          className="flex flex-col flex-1 p-2 sm:p-2.5 border-t border-gray-100 min-h-0"
          style={{ background: 'linear-gradient(180deg, #ffffff 0%, rgba(248,250,249,0.98) 100%)' }}
        >
          <h3 className="text-xs font-bold text-gray-900 line-clamp-2 leading-tight mb-2">
            {getDisplayName(category)}
          </h3>
          <span
            className="mt-auto w-full inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold text-white transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
              boxShadow: '0 2px 6px rgba(93, 138, 106, 0.3)',
            }}
          >
            {t('gallery.viewCategory')}
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </span>
        </div>
      </Link>
    );
  };

  // Grid layout for category cards – unified so that large screens show 6 cards per row.
  const embeddedItems = categoryRowItems;
  const isPublicGalleryRoot = standalone && basePath === DEFAULT_GALLERY_BASE;
  const gridClass =
    'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 min-w-0 overflow-hidden';

  const categoryRow = (
    <div className={`flex flex-col min-w-0 overflow-hidden flex-1 min-h-0 ${isCompactMode ? 'px-3 py-2' : 'px-4 py-4'}`}>
      {loading ? (
        <div className={`min-w-0 grid ${gridClass}`}>
          {categoryKeys.slice(0, 8).map((_, i) => (
            <div key={i} className="flex flex-col rounded-xl overflow-hidden bg-gray-100 animate-pulse min-w-0">
              <div className="aspect-[4/3] w-full max-h-32 sm:max-h-36 bg-gray-200/80" />
              <div className="p-2 sm:p-2.5 border-t border-gray-100 flex-1 min-h-0" />
            </div>
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
  const categoryGridClass =
    'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3';

  const categoryGridView = categoryView && (
    <div className="flex-1 min-h-0 overflow-auto p-4">
      <Link
        href={galleryBase}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-green-power-700 hover:text-green-power-800 mb-4 focus:outline-none focus:ring-2 focus:ring-green-power-400 focus:ring-offset-1 rounded-lg"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('gallery.backToCategories')}
      </Link>
      <h3 className="text-lg font-bold text-gray-900 tracking-tight mb-4">
        {getDisplayName(categoryFromUrl)} ({filteredImages.length})
      </h3>
      {loading ? (
        <div className={categoryGridClass}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col rounded-xl overflow-hidden bg-gray-100 animate-pulse">
              <div className="aspect-[4/3] w-full max-h-32 sm:max-h-36 bg-gray-200/80" />
              <div className="p-2 sm:p-2.5 border-t border-gray-100 space-y-2">
                <div className="h-3 bg-gray-200/80 rounded w-3/4" />
                <div className="h-4 bg-gray-200/80 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredImages.length === 0 ? (
        <p className="text-gray-500 text-sm py-8">{t('gallery.noImagesInCategory', { category: getDisplayName(categoryFromUrl) })}</p>
      ) : (
        <div className={categoryGridClass}>
          {filteredImages.map((image, index) => {
            const isOfferEligible = image.category === OFFERS_CATEGORY_KEY || image.offerEligible === true;
            return (
              <div
                key={image.id}
                className="group/card flex flex-col rounded-xl overflow-hidden bg-white border border-gray-100 transition-all duration-300 focus-within:ring-2 focus-within:ring-green-power-500 focus-within:ring-offset-2"
                style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)' }}
              >
                <button
                  type="button"
                  onClick={() => setLightboxIndex(index)}
                  className="relative aspect-[4/3] w-full max-h-32 sm:max-h-36 overflow-hidden bg-gray-100 cursor-zoom-in flex-shrink-0 text-left"
                >
                  <img
                    src={image.url}
                    alt={image.title || getDisplayName(image.category)}
                    className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300" />
                </button>
                <div
                  className="flex flex-col flex-1 p-2 sm:p-2.5 border-t border-gray-100 min-h-0"
                  style={{ background: 'linear-gradient(180deg, #ffffff 0%, rgba(248,250,249,0.98) 100%)' }}
                >
                  <h3 className="text-xs font-bold text-gray-900 line-clamp-2 leading-tight mb-2">
                    {image.title || getDisplayName(image.category)}
                  </h3>
                  {image.offerPrice && (
                    <p className="text-xs font-semibold text-red-600 mb-2">€ {image.offerPrice}</p>
                  )}
                  {isOfferEligible && !hideContactAndFooter ? (
                    <Link
                      href="/offer"
                      className="mt-auto w-full inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold text-white transition-all duration-200 hover:shadow-md active:scale-[0.98]"
                      style={{
                        background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
                        boxShadow: '0 2px 6px rgba(93, 138, 106, 0.3)',
                      }}
                    >
                      {t('offer.requestQuote')}
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(index)}
                      className="mt-auto w-full inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold text-white transition-all duration-200"
                      style={{
                        background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
                        boxShadow: '0 2px 6px rgba(93, 138, 106, 0.3)',
                      }}
                    >
                      {t('gallery.viewCategory')}
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const headerBlock = (
    <div
      className={`flex-shrink-0 flex items-start justify-between gap-3 border-b ${standalone ? 'px-4 py-3 bg-gradient-to-r from-green-power-50 to-green-power-100 border-green-power-100/80' : isCompactMode ? 'px-3 py-2 border-gray-200/60' : 'px-4 sm:px-6 py-4 border-gray-200/60'}`}
    >
      <div className="min-w-0 flex-1">
        <h2 className={`text-gray-900 flex items-center gap-1.5 font-display ${isCompactMode ? 'text-sm font-semibold' : 'text-base sm:text-lg font-bold'}`}>
          <span className="text-amber-500">⭐</span> {t('gallery.title')}
        </h2>
        <p className={`text-gray-600 mt-0.5 ${isCompactMode ? 'text-[10px]' : 'text-xs'}`}>{t('gallery.subtitle')}</p>
      </div>
      {!categoryView && !hideContactAndFooter && (
        <div className="flex items-center gap-2">
          <Link
            href="/catalogue"
            className={`flex-shrink-0 inline-flex items-center gap-1.5 text-green-power-700 bg-white rounded-xl font-semibold shadow-md transition-all hover:shadow hover:scale-[1.02] active:scale-[0.98] ${isCompactMode ? 'px-3 py-2 text-xs sm:text-sm' : 'px-4 py-2.5 text-sm'}`}
          >
            {t('catalogue.button', 'Catalogue')}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <Link
            href="/offer"
            className={`flex-shrink-0 inline-flex items-center gap-1.5 text-white rounded-xl font-semibold shadow-lg transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98] ${isCompactMode ? 'px-3 py-2 text-xs sm:text-sm' : 'px-4 py-2.5 text-sm'}`}
            style={{
              background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
              boxShadow: '0 2px 6px rgba(93, 138, 106, 0.3)',
            }}
          >
            {t('offer.requestQuote')}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      )}
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

  const offerPortal =
    mounted && offerOpen && !categoryView && !hideContactAndFooter
      ? createPortal(
          <>
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60" onClick={closeOfferPopup}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-lg sm:text-xl font-semibold text-gray-900">{t('offer.title')}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{t('offer.subtitle')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeOfferPopup}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    aria-label={t('common.close')}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="px-5 sm:px-6 py-4 overflow-y-auto flex-1">
                  {loading ? (
                    <p className="text-gray-500 text-sm">{t('common.loading')}</p>
                  ) : offerImages.length === 0 ? (
                    <p className="text-gray-600 text-sm">{t('offer.noEligibleProducts')}</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {offerImages.map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => openOfferPick(img)}
                          className="block w-full text-left rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-green-power-200 transition-all focus:outline-none focus:ring-2 focus:ring-green-power-500 overflow-hidden"
                        >
                          <div className="relative aspect-square overflow-hidden bg-gray-100">
                            <img src={img.url} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="p-2">
                            <p className="text-xs font-medium text-gray-900 line-clamp-2">
                              {img.title || getDisplayName(img.category)}
                            </p>
                            <span className="text-[10px] text-green-power-600 font-medium mt-0.5 inline-block">
                              {t('offer.addToOffer')}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                {offerCart.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-gray-100">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">{t('offer.myOfferRequest')}</h4>

                    <ul className="space-y-2 mb-4">
                      {offerCart.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm bg-gray-50 rounded-lg p-2 border border-gray-100">
                          <img src={item.imageUrl} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{item.itemName}</p>
                            <p className="text-gray-600 text-xs">
                              {item.color || '—'}
                              {item.quantityMeters && ` · ${item.quantityMeters} m`}
                              {item.quantityPieces && ` · ${item.quantityPieces} pcs`}
                            </p>
                          </div>
                          <button type="button" onClick={() => removeOfferItem(i)} className="text-red-600 hover:text-red-700 text-xs font-medium">
                            {t('offer.remove')}
                          </button>
                        </li>
                      ))}
                    </ul>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.firstName')}</label>
                        <input
                          type="text"
                          value={offerFirstName}
                          onChange={(e) => { setOfferFirstName(e.target.value); setOfferFieldErrors((p) => ({ ...p, firstName: '' })); }}
                          className={`w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 ${offerFieldErrors.firstName ? 'border-red-500' : 'border-gray-200'}`}
                          placeholder={t('offer.firstNamePlaceholder')}
                          required
                        />
                        {offerFieldErrors.firstName ? <p className="text-xs text-red-600 mt-1">{offerFieldErrors.firstName}</p> : null}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.lastName')}</label>
                        <input
                          type="text"
                          value={offerLastName}
                          onChange={(e) => { setOfferLastName(e.target.value); setOfferFieldErrors((p) => ({ ...p, lastName: '' })); }}
                          className={`w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 ${offerFieldErrors.lastName ? 'border-red-500' : 'border-gray-200'}`}
                          placeholder={t('offer.lastNamePlaceholder')}
                          required
                        />
                        {offerFieldErrors.lastName ? <p className="text-xs text-red-600 mt-1">{offerFieldErrors.lastName}</p> : null}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">{t('common.email')}</label>
                        <input
                          type="email"
                          value={offerEmail}
                          onChange={(e) => { setOfferEmail(e.target.value); setOfferFieldErrors((p) => ({ ...p, email: '' })); }}
                          className={`w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 ${offerFieldErrors.email ? 'border-red-500' : 'border-gray-200'}`}
                          placeholder={t('offer.emailPlaceholder')}
                          required
                        />
                        {offerFieldErrors.email ? <p className="text-xs text-red-600 mt-1">{offerFieldErrors.email}</p> : null}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.mobile')}</label>
                        <input
                          type="tel"
                          value={offerMobile}
                          onChange={(e) => { setOfferMobile(e.target.value); setOfferFieldErrors((p) => ({ ...p, mobile: '' })); }}
                          className={`w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 ${offerFieldErrors.mobile ? 'border-red-500' : 'border-gray-200'}`}
                          placeholder={t('offer.mobilePlaceholder')}
                          required
                        />
                        {offerFieldErrors.mobile ? <p className="text-xs text-red-600 mt-1">{offerFieldErrors.mobile}</p> : null}
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.address')}</label>
                      <input
                        type="text"
                        value={offerAddress}
                        onChange={(e) => { setOfferAddress(e.target.value); setOfferFieldErrors((p) => ({ ...p, address: '' })); }}
                        className={`w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 ${offerFieldErrors.address ? 'border-red-500' : 'border-gray-200'}`}
                        placeholder={t('offer.addressPlaceholder')}
                        required
                      />
                      {offerFieldErrors.address ? <p className="text-xs text-red-600 mt-1">{offerFieldErrors.address}</p> : null}
                    </div>

                    {offerSubmitError ? <p className="text-sm text-red-600 mt-3">{offerSubmitError}</p> : null}

                    <div className="mt-4 flex gap-2">
                      <button type="button" onClick={closeOfferPopup} disabled={offerSubmitting} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-60">
                        {t('common.cancel')}
                      </button>
                      <button type="button" onClick={submitOfferRequest} disabled={offerSubmitting} className="flex-1 py-2.5 rounded-xl bg-green-power-600 text-white font-medium shadow-lg hover:bg-green-power-700 disabled:opacity-70">
                        {offerSubmitting ? t('offer.submitting') : t('offer.submit')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              </div>
            </div>

            {offerPickImage && (
              <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60" onClick={closeOfferPick}>
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-gray-900">{t('offer.addToOffer')}</h4>
                    <button type="button" onClick={closeOfferPick} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label={t('common.close')}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="mb-4">
                    <img src={offerPickImage.url} alt="" className="w-full aspect-video object-cover rounded-lg" />
                  </div>

                  {(() => {
                    const text = offerPickImage.title || getDisplayName(offerPickImage.category);
                    const showToggle = (text || '').trim().length > 90;
                    return (
                      <div className="mb-3">
                        <p className={`text-sm font-medium text-gray-900 ${offerPickDescExpanded ? '' : 'line-clamp-2'} break-words`}>{text}</p>
                        {showToggle ? (
                          <button type="button" onClick={() => setOfferPickDescExpanded((v) => !v)} className="mt-1 text-xs font-medium text-green-power-700 hover:text-green-power-800">
                            {offerPickDescExpanded ? t('offer.less') : t('offer.more')}
                          </button>
                        ) : null}
                      </div>
                    );
                  })()}

                  {(offerPickImage.offerColorOptions?.length ?? 0) > 0 && (
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.color')}</label>
                      <select value={offerPickColor} onChange={(e) => setOfferPickColor(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500">
                        {offerPickImage.offerColorOptions!.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.quantityMeters')}</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={offerPickMeters}
                        onChange={(e) => { setOfferPickMeters(digitsOnly(e.target.value)); setOfferPickError(null); }}
                        onPaste={(e) => { e.preventDefault(); setOfferPickMeters(digitsOnly(offerPickMeters + (e.clipboardData.getData('text') || ''))); setOfferPickError(null); }}
                        placeholder={t('offer.quantityMetersPlaceholder')}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.quantityPieces')}</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={offerPickPieces}
                        onChange={(e) => { setOfferPickPieces(digitsOnly(e.target.value)); setOfferPickError(null); }}
                        onPaste={(e) => { e.preventDefault(); setOfferPickPieces(digitsOnly(offerPickPieces + (e.clipboardData.getData('text') || ''))); setOfferPickError(null); }}
                        placeholder={t('offer.quantityPiecesPlaceholder')}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                      />
                    </div>
                  </div>
                  {offerPickError ? <p className="text-sm text-red-600 mt-3">{offerPickError}</p> : null}
                  <div className="flex gap-2 mt-5">
                    <button type="button" onClick={closeOfferPick} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">
                      {t('common.cancel')}
                    </button>
                    <button type="button" onClick={addOfferItemToCart} className="flex-1 py-2.5 rounded-xl bg-green-power-600 text-white font-medium hover:bg-green-power-700">
                      {t('offer.addToOffer')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {offerSuccessOpen && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60" onClick={() => { setOfferSuccessOpen(false); closeOfferPopup(); }}>
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="mx-auto w-12 h-12 rounded-full bg-green-power-100 text-green-power-700 flex items-center justify-center mb-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900">{t('offer.successTitle')}</h4>
                  <p className="text-sm text-gray-600 mt-1">{t('offer.successMessage')}</p>
                  <button type="button" onClick={() => { setOfferSuccessOpen(false); closeOfferPopup(); }} className="mt-5 w-full py-2.5 rounded-xl bg-green-power-600 text-white font-medium hover:bg-green-power-700">
                    {t('offer.successClose')}
                  </button>
                </div>
              </div>
            )}
          </>,
          document.body
        )
      : null;

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
        {offerPortal}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col min-h-0">
      <div
        className="rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-sm flex flex-col min-h-0 flex-1"
        style={{
          boxShadow: '0 0 0 1px rgba(114,164,127,0.12) inset, 0 4px 24px rgba(0,0,0,0.06)',
        }}
      >
        {inner}
      </div>
      {offerPortal}

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
