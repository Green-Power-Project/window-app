'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGalleryCategoryLabels } from '@/lib/galleryCategoryLabels';
import { db } from '@/lib/firebase';
import { getGalleryImages, type GalleryImage } from '@/lib/galleryClient';
import { getAdminPanelBaseUrl } from '@/lib/adminPanelUrl';
import { OFFERS_CATEGORY_KEY } from '@/lib/galleryConstants';

interface CartItem {
  imageId: string;
  imageUrl: string;
  itemName: string;
  color: string;
  quantityMeters: string;
  quantityPieces: string;
  thickness?: string;
  length?: string;
  width?: string;
  height?: string;
  note?: string;
  /** Cloudinary URLs after final submit; not set until then when user added local photos */
  photoUrls?: string[];
  /** Local files kept until form is submitted (not uploaded when adding to cart) */
  photoFiles?: File[];
  /** Object URLs for preview in cart; revoked when item removed or after submit */
  photoPreviewUrls?: string[];
}

export default function OfferPage() {
  const { t } = useLanguage();
  const { getDisplayName } = useGalleryCategoryLabels();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalImage, setModalImage] = useState<GalleryImage | null>(null);
  const [modalColor, setModalColor] = useState('');
  const [modalMeters, setModalMeters] = useState('');
  const [modalPieces, setModalPieces] = useState('');
  const [modalThickness, setModalThickness] = useState('');
  const [modalLength, setModalLength] = useState('');
  const [modalWidth, setModalWidth] = useState('');
  const [modalHeight, setModalHeight] = useState('');
  const [modalNote, setModalNote] = useState('');
  const [modalPhotoUrls, setModalPhotoUrls] = useState<string[]>([]);
  const [modalPhotoFiles, setModalPhotoFiles] = useState<File[]>([]);
  const [modalPhotoPreviews, setModalPhotoPreviews] = useState<string[]>([]);
  const [modalPhotoError, setModalPhotoError] = useState<string | null>(null);
  const [modalDescExpanded, setModalDescExpanded] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [isAddingMore, setIsAddingMore] = useState(false);
  const rightSectionRef = useRef<HTMLDivElement>(null);
  const productGridRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const offerImages = images.filter(
    (img) => img.category === OFFERS_CATEGORY_KEY || img.offerEligible === true
  );

  const loadImages = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getGalleryImages(db);
      setImages(list);
    } catch (error) {
      console.error('Error loading gallery:', error);
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  useEffect(() => {
    if (modalPhotoPreviews.length > 0 && rightSectionRef.current) {
      const el = rightSectionRef.current;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [modalPhotoPreviews.length]);

  const modalDescription = modalImage
    ? modalImage.offerItemName || modalImage.title || getDisplayName(modalImage.category)
    : '';
  const MAX_DESCRIPTION_CHARS = 220;
  const isLongModalDescription = modalDescription.length > MAX_DESCRIPTION_CHARS;
  const visibleModalDescription =
    !isLongModalDescription || modalDescExpanded
      ? modalDescription
      : modalDescription
          .slice(0, MAX_DESCRIPTION_CHARS)
          .replace(/\s+\S*$/, '') + '…';

  function openModal(img: GalleryImage) {
    setModalImage(img);
    const opts = img.offerColorOptions ?? [];
    setModalColor(opts[0] ?? '');
    setModalMeters('');
    setModalPieces('');
    setModalThickness('');
    setModalLength('');
    setModalWidth('');
    setModalHeight('');
    setModalNote('');
    setModalPhotoUrls([]);
    setModalPhotoPreviews((prev) => {
      prev.forEach(URL.revokeObjectURL);
      return [];
    });
    setModalPhotoFiles([]);
    setModalPhotoError(null);
    setModalDescExpanded(false);
  }

  /** Upload files to Cloudinary (used only on final form submit, not when adding to cart). */
  async function uploadFilesToCloudinary(files: File[]): Promise<string[]> {
    const urls: string[] = [];
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'offers/customer-uploads');
      const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      if (data.secure_url) urls.push(data.secure_url);
    }
    return urls;
  }

  function addToCart() {
    if (!modalImage) return;
    const color = modalColor.trim() || (modalImage.offerColorOptions?.[0] ?? '');
    const hasLocalPhotos = modalPhotoFiles.length > 0;
    setCart((prev) => [
      ...prev,
      {
        imageId: modalImage.id,
        imageUrl: modalImage.url,
        itemName: modalImage.offerItemName ?? modalImage.title ?? modalImage.category ?? 'Item',
        color,
        quantityMeters: modalMeters.trim(),
        quantityPieces: modalPieces.trim(),
        thickness: modalThickness.trim() || undefined,
        length: modalLength.trim() || undefined,
        width: modalWidth.trim() || undefined,
        height: modalHeight.trim() || undefined,
        note: modalNote.trim() || undefined,
        photoUrls: hasLocalPhotos ? undefined : (modalPhotoUrls.length ? modalPhotoUrls : undefined),
        photoFiles: hasLocalPhotos ? [...modalPhotoFiles] : undefined,
        photoPreviewUrls: hasLocalPhotos ? [...modalPhotoPreviews] : undefined,
      },
    ]);
    closeModal(hasLocalPhotos ? modalPhotoPreviews : undefined);
    if (!isAddingMore && formRef.current) {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    }
  }

  function closeModal(transferPreviewUrls?: string[]) {
    setModalPhotoPreviews((prev) => {
      prev.forEach((url) => {
        if (!transferPreviewUrls?.includes(url)) URL.revokeObjectURL(url);
      });
      return [];
    });
    setModalPhotoFiles([]);
    setModalImage(null);
  }

  function removeFromCart(index: number) {
    setCart((prev) => {
      const item = prev[index];
      if (item?.photoPreviewUrls?.length) {
        item.photoPreviewUrls.forEach(URL.revokeObjectURL);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) return;
    const base = getAdminPanelBaseUrl();
    if (!base) {
      setSubmitStatus('error');
      return;
    }
    setSubmitting(true);
    setSubmitStatus('idle');
    try {
      const itemsWithPhotoUrls: Array<Omit<CartItem, 'photoFiles' | 'photoPreviewUrls'>> = [];
      for (const item of cart) {
        let photoUrls = item.photoUrls ?? undefined;
        if (item.photoFiles?.length) {
          photoUrls = await uploadFilesToCloudinary(item.photoFiles);
          if (item.photoPreviewUrls?.length) {
            item.photoPreviewUrls.forEach(URL.revokeObjectURL);
          }
        }
        itemsWithPhotoUrls.push({
          imageId: item.imageId,
          imageUrl: item.imageUrl,
          itemName: item.itemName,
          color: item.color,
          quantityMeters: item.quantityMeters,
          quantityPieces: item.quantityPieces,
          thickness: item.thickness,
          length: item.length,
          width: item.width,
          height: item.height,
          note: item.note,
          photoUrls: photoUrls?.length ? photoUrls : undefined,
        });
      }
      const res = await fetch(`${base}/api/offers/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          mobile: mobile.trim(),
          address: address.trim(),
          items: itemsWithPhotoUrls.map((item) => ({
            imageId: item.imageId,
            imageUrl: item.imageUrl,
            itemName: item.itemName,
            color: item.color,
            quantityMeters: item.quantityMeters || undefined,
            quantityPieces: item.quantityPieces || undefined,
            thickness: item.thickness,
            length: item.length,
            width: item.width,
            height: item.height,
            note: item.note,
            photoUrls: item.photoUrls,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSubmitStatus('success');
        setCart([]);
        setFirstName('');
        setLastName('');
        setEmail('');
        setMobile('');
        setAddress('');
      } else {
        setSubmitStatus('error');
      }
    } catch {
      setSubmitStatus('error');
    } finally {
      setSubmitting(false);
    }
  }

  const formSection = (
    <>
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="w-1 h-5 rounded-full bg-gradient-to-b from-green-power-400 to-green-power-600" />
        {t('offer.myOfferRequest')}
      </h2>
      <ul className="space-y-2 mb-5">
        {cart.map((item, i) => (
          <li
            key={i}
            className="flex items-center gap-3 text-sm rounded-xl p-3 transition-colors"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(240,247,242,0.4) 100%)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 0 0 1px rgba(114,164,127,0.08)',
            }}
          >
            <button
              type="button"
              onClick={() => setLightboxUrl(item.imageUrl)}
              className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden ring-1 ring-black/5 cursor-zoom-in"
            >
              <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{item.itemName}</p>
              <p className="text-gray-600 text-xs mt-0.5">
                {item.color}
                {item.quantityMeters && ` · ${item.quantityMeters} m`}
                {item.quantityPieces && ` · ${item.quantityPieces} pcs`}
              </p>
              {(item.photoPreviewUrls?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {item.photoPreviewUrls!.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLightboxUrl(url); }}
                      className="w-8 h-8 rounded-md overflow-hidden ring-1 ring-black/10 flex-shrink-0 cursor-zoom-in"
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeFromCart(i)}
              className="text-red-500 hover:text-red-600 text-xs font-medium flex-shrink-0 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
            >
              {t('offer.remove')}
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.firstName')}</label>
          <input
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t('offer.firstNamePlaceholder')}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-power-500/50 focus:border-green-power-500 transition-shadow"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.lastName')}</label>
          <input
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={t('offer.lastNamePlaceholder')}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-power-500/50 focus:border-green-power-500 transition-shadow"
          />
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">{t('common.email')}</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('offer.emailPlaceholder')}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-power-500/50 focus:border-green-power-500 transition-shadow"
        />
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.mobile')}</label>
        <input
          type="tel"
          required
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder={t('offer.mobilePlaceholder')}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-power-500/50 focus:border-green-power-500 transition-shadow"
        />
      </div>
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.address')}</label>
        <input
          type="text"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t('offer.addressPlaceholder')}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-power-500/50 focus:border-green-power-500 transition-shadow"
        />
      </div>
      {submitStatus === 'success' && (
        <p className="text-green-power-700 text-sm font-medium mb-3">{t('offer.successMessage')}</p>
      )}
      {submitStatus === 'error' && (
        <p className="text-red-600 text-sm font-medium mb-3">{t('offer.errorMessage')}</p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-white transition-all duration-200 disabled:opacity-70 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
        style={{
          background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 50%, #4d6f57 100%)',
          boxShadow: '0 4px 14px rgba(93, 138, 106, 0.4)',
        }}
      >
        {submitting ? t('offer.submitting') : t('offer.submit')}
      </button>
    </>
  );

  return (
    <>
      {cart.length > 0 && isAddingMore ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center p-4 sm:p-6 bg-black/10">
          <div className="flex w-full max-w-6xl h-[85vh] max-h-[800px] min-h-0 rounded-2xl overflow-hidden shadow-2xl">
            {/* Left: gallery – maximum space, separate card */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden rounded-l-2xl border-r border-white/30 bg-white/75 backdrop-blur-xl shadow-lg shadow-black/5">
              <div className="flex items-center justify-between gap-3 p-4 border-b border-white/40">
                <div>
                  <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-green-power-700 hover:text-green-power-800">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    {t('offer.backToGallery')}
                  </Link>
                  <h2 className="text-lg font-bold text-gray-900 mt-1">{t('offer.title')}</h2>
                  <p className="text-sm text-gray-600">{t('offer.subtitle')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingMore(false)}
                  className="flex-shrink-0 px-4 py-2 rounded-xl border-2 border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50"
                >
                  {t('offer.doneAdding')}
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {loading ? (
                  <p className="text-gray-500 py-8 text-sm">{t('common.loading')}</p>
                ) : offerImages.length === 0 ? (
                  <p className="text-gray-600 py-8 text-sm">{t('offer.noEligibleProducts')}</p>
                ) : (
                  <div ref={productGridRef} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {offerImages.map((img) => (
                      <div
                        key={img.id}
                        className="group/card flex flex-col rounded-xl overflow-hidden bg-white/90 backdrop-blur-sm border border-white/50 shadow-md"
                      >
                        <button type="button" onClick={(e) => { e.stopPropagation(); setLightboxUrl(img.url); }} className="relative aspect-[4/3] w-full max-h-36 overflow-hidden bg-gray-100 cursor-zoom-in">
                          <img src={img.url} alt="" className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300" />
                        </button>
                        <div className="p-2 border-t border-gray-100">
                          <h3 className="text-xs font-bold text-gray-900 line-clamp-2 leading-tight mb-2">{img.offerItemName || img.title || getDisplayName(img.category)}</h3>
                          <button type="button" onClick={() => openModal(img)} className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' }}>
                            {t('offer.requestQuote')}
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Right: My request + form – minimum space, separate card */}
            <div className="w-full sm:w-[min(100%,380px)] flex-shrink-0 flex flex-col overflow-hidden rounded-r-2xl bg-white/75 backdrop-blur-xl border-l border-white/30 shadow-lg shadow-black/5">
              <div className="flex-1 overflow-auto p-4">
                <form ref={formRef} onSubmit={handleSubmit}>
                  {formSection}
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : (
    <div className="relative z-10 flex flex-1 flex-col w-full px-3 sm:px-4 pt-2 sm:pt-3 pb-2 sm:pb-3 overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 sm:gap-6">
        <div
          className="rounded-2xl overflow-hidden p-4 sm:p-6 relative"
          style={{
            background: 'linear-gradient(165deg, rgba(255,255,255,0.95) 0%, rgba(240,247,242,0.5) 50%, rgba(255,255,255,0.9) 100%)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            boxShadow: '0 0 0 1px rgba(114,164,127,0.12) inset, 0 4px 24px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.8) inset',
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-power-400 via-green-power-500 to-green-power-600 rounded-t-2xl" aria-hidden />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-green-power-700 hover:text-green-power-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {t('offer.backToGallery')}
              </Link>
            </div>
            {cart.length > 0 && !isAddingMore && (
              <button
                type="button"
                onClick={() => {
                  setIsAddingMore(true);
                  productGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-md"
                style={{
                  background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
                  boxShadow: '0 2px 8px rgba(93, 138, 106, 0.3)',
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                {t('offer.addMoreItems')}
              </button>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">{t('offer.title')}</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">{t('offer.subtitle')}</p>

          {loading ? (
            <p className="text-gray-500 py-8 text-sm">{t('common.loading')}</p>
          ) : offerImages.length === 0 && cart.length === 0 ? (
            <p className="text-gray-600 py-8 text-sm">{t('offer.noEligibleProducts')}</p>
          ) : offerImages.length > 0 && (cart.length === 0 || isAddingMore) ? (
              <div ref={productGridRef} className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mt-4 scroll-mt-4">
                {offerImages.map((img) => (
                  <div
                    key={img.id}
                    className="group/card flex flex-col rounded-xl overflow-hidden transition-all duration-300 focus-within:ring-2 focus-within:ring-green-power-500 focus-within:ring-offset-2 bg-white border border-gray-100"
                    style={{
                      boxShadow: '0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxUrl(img.url);
                      }}
                      className="relative aspect-[4/3] w-full max-h-32 sm:max-h-36 overflow-hidden bg-gray-100 cursor-zoom-in flex-shrink-0"
                    >
                      <img
                        src={img.url}
                        alt=""
                        className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300" />
                      <span className="absolute bottom-1 left-1 right-1 text-center text-[9px] font-medium text-white opacity-0 group-hover/card:opacity-100 transition-opacity duration-200 drop-shadow-md">
                        View full size
                      </span>
                    </button>
                    <div
                      className="flex flex-col flex-1 p-2 sm:p-2.5 border-t border-gray-100 min-h-0"
                      style={{
                        background: 'linear-gradient(180deg, #ffffff 0%, rgba(248,250,249,0.98) 100%)',
                      }}
                    >
                      <h3 className="text-xs font-bold text-gray-900 line-clamp-2 leading-tight mb-2">
                        {img.offerItemName || img.title || getDisplayName(img.category)}
                      </h3>
                      <button
                        type="button"
                        onClick={() => openModal(img)}
                        className="mt-auto w-full inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold text-white transition-all duration-200 hover:shadow-md active:scale-[0.98]"
                        style={{
                          background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
                          boxShadow: '0 2px 6px rgba(93, 138, 106, 0.3)',
                        }}
                      >
                        {t('offer.requestQuote')}
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
          ) : null}

          {cart.length > 0 && (
            <form ref={formRef} onSubmit={handleSubmit} className="mt-6 pt-6 border-t border-green-power-100/80">
              {formSection}
            </form>
          )}
        </div>
      </div>
    </div>
      )}

      {/* Add-to-offer modal */}
      {modalImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(8px)' }}
          onClick={closeModal}
        >
          <div
            className="w-full max-w-3xl rounded-2xl p-4 sm:p-6 relative overflow-hidden"
            style={{
              background: 'linear-gradient(165deg, #ffffff 0%, #f8faf9 50%, #f0f7f2 100%)',
              boxShadow: '0 0 0 1px rgba(114,164,127,0.15) inset, 0 25px 50px -12px rgba(0,0,0,0.2), 0 12px 24px -8px rgba(93,138,106,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-green-power-400 via-green-power-500 to-green-power-600" aria-hidden />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 tracking-tight">{t('offer.addToOffer')}</h3>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-xl hover:bg-gray-100/80 transition-colors"
                aria-label={t('common.close')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-4 flex flex-col min-h-0 max-h-[60vh]">
              <div className="flex flex-col md:flex-row gap-4 md:gap-5 flex-1 min-h-0">
                {/* Left card: image + description (separate, scrollable) */}
                <div
                  className="md:w-[48%] flex-1 min-h-0 rounded-xl p-3 flex flex-col gap-2 overflow-y-auto"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(240,247,242,0.5) 100%)',
                    boxShadow: '0 0 0 1px rgba(114,164,127,0.12), 0 4px 12px rgba(0,0,0,0.04)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(modalImage.url)}
                    className="rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-black/5 block w-full cursor-zoom-in"
                  >
                    <img src={modalImage.url} alt="" className="w-full aspect-[4/3] object-cover" />
                  </button>
                  <div className="min-h-0">
                    <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1">{t('offer.itemName')}</label>
                    <p className="text-xs text-gray-800 whitespace-pre-line break-words leading-snug">
                      {visibleModalDescription}
                    </p>
                    {isLongModalDescription && (
                      <button
                        type="button"
                        onClick={() => setModalDescExpanded((prev) => !prev)}
                        className="mt-1 text-[11px] font-semibold text-green-power-600 hover:text-green-power-700 transition-colors"
                      >
                        {modalDescExpanded ? t('offer.less') : t('offer.more')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Right card: specifications and inputs (separate, scrollable) */}
                <div
                  ref={rightSectionRef}
                  className="md:w-[48%] flex-1 min-h-0 rounded-xl p-3 space-y-2 overflow-y-auto"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(240,247,242,0.5) 100%)',
                    boxShadow: '0 0 0 1px rgba(114,164,127,0.12), 0 4px 12px rgba(0,0,0,0.04)',
                  }}
                >
                  {(modalImage.offerColorOptions?.length ?? 0) > 0 && (
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">{t('offer.color')}</label>
                      <div className="flex flex-wrap gap-1.5">
                        {modalImage.offerColorOptions!.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setModalColor(c)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-200 ${
                              modalColor === c
                                ? 'text-white border-green-power-500 shadow-md shadow-green-power-500/25'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-green-power-200 hover:bg-green-power-50/50'
                            }`}
                            style={modalColor === c ? { background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' } : undefined}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(modalImage.offerThicknessOptions?.length ?? 0) > 0 && (
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">{t('offer.thickness')} (mm)</label>
                      <div className="flex flex-wrap gap-1.5">
                        {modalImage.offerThicknessOptions!.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setModalThickness(v)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-200 ${
                              modalThickness === v
                                ? 'text-white border-green-power-500 shadow-md shadow-green-power-500/25'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-green-power-200 hover:bg-green-power-50/50'
                            }`}
                            style={modalThickness === v ? { background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' } : undefined}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(modalImage.offerLengthOptions?.length ?? 0) > 0 && (
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">{t('offer.length')} (m)</label>
                      <div className="flex flex-wrap gap-1.5">
                        {modalImage.offerLengthOptions!.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setModalLength(v)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-200 ${
                              modalLength === v
                                ? 'text-white border-green-power-500 shadow-md shadow-green-power-500/25'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-green-power-200 hover:bg-green-power-50/50'
                            }`}
                            style={modalLength === v ? { background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' } : undefined}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(modalImage.offerWidthOptions?.length ?? 0) > 0 && (
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">{t('offer.width')} (m)</label>
                      <div className="flex flex-wrap gap-1.5">
                        {modalImage.offerWidthOptions!.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setModalWidth(v)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-200 ${
                              modalWidth === v
                                ? 'text-white border-green-power-500 shadow-md shadow-green-power-500/25'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-green-power-200 hover:bg-green-power-50/50'
                            }`}
                            style={modalWidth === v ? { background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' } : undefined}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(modalImage.offerHeightOptions?.length ?? 0) > 0 && (
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">{t('offer.height')} (m)</label>
                      <div className="flex flex-wrap gap-1.5">
                        {modalImage.offerHeightOptions!.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setModalHeight(v)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-200 ${
                              modalHeight === v
                                ? 'text-white border-green-power-500 shadow-md shadow-green-power-500/25'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-green-power-200 hover:bg-green-power-50/50'
                            }`}
                            style={modalHeight === v ? { background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' } : undefined}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">{t('offer.quantityPieces')}</label>
                    <input
                      type="text"
                      value={modalPieces}
                      onChange={(e) => setModalPieces(e.target.value)}
                      placeholder={t('offer.quantityPiecesPlaceholder')}
                      className="w-full rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-green-power-500/50 focus:border-green-power-500 transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
                      {t('offer.itemNote')}
                    </label>
                    <textarea
                      value={modalNote}
                      onChange={(e) => setModalNote(e.target.value)}
                      placeholder={t('offer.itemNotePlaceholder')}
                      rows={2}
                      className="w-full rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-green-power-500/50 focus:border-green-power-500 resize-none transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
                      {t('offer.itemPhotos')}
                    </label>
                    <p className="text-[10px] text-gray-500 mb-0.5">
                      {t('offer.itemPhotosHint')}
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length) return;
                        setModalPhotoError(null);
                        const currentCount = modalPhotoFiles.length;
                        const toAdd = files.slice(0, Math.max(0, 5 - currentCount));
                        if (toAdd.length === 0) return;
                        const newPreviews = toAdd.map((f) => URL.createObjectURL(f));
                        setModalPhotoFiles((prev) => [...prev, ...toAdd].slice(0, 5));
                        setModalPhotoPreviews((prev) => [...prev, ...newPreviews].slice(0, 5));
                        e.target.value = '';
                      }}
                      className="block w-full text-xs text-gray-600 file:mr-3 file:px-4 file:py-2.5 file:rounded-xl file:border-2 file:border-green-power-600 file:bg-green-power-600 file:text-white file:text-sm file:font-bold hover:file:bg-green-power-700 hover:file:border-green-power-700 file:transition-colors file:cursor-pointer"
                    />
                    {modalPhotoError && (
                      <p className="text-xs text-red-600 mt-1">{modalPhotoError}</p>
                    )}
                    {(modalPhotoPreviews.length > 0 || modalPhotoUrls.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {modalPhotoPreviews.map((url, idx) => (
                          <div key={`preview-${idx}`} className="relative group">
                            <button
                              type="button"
                              onClick={() => setLightboxUrl(url)}
                              className="block w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden ring-1 ring-black/10 shadow-md cursor-zoom-in flex-shrink-0"
                            >
                              <img src={url} alt="" className="w-full h-full object-cover" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                URL.revokeObjectURL(url);
                                setModalPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
                                setModalPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
                              }}
                              className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow hover:bg-red-600 transition-colors"
                              aria-label={t('offer.remove')}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {modalPhotoUrls.map((url, idx) => (
                          <button
                            key={`url-${idx}`}
                            type="button"
                            onClick={() => setLightboxUrl(url)}
                            className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden ring-1 ring-black/10 shadow-md cursor-zoom-in block"
                          >
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => closeModal()}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 text-sm font-semibold hover:border-gray-300 hover:bg-gray-50 transition-all"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!modalImage) return;
                  setModalPhotoError(null);
                  addToCart();
                }}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 50%, #4d6f57 100%)',
                  boxShadow: '0 4px 14px rgba(93, 138, 106, 0.35)',
                }}
              >
                {t('offer.addToOffer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t('common.close')}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 z-10 p-2 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors"
            aria-label={t('common.close')}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-full w-auto h-auto object-contain"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        </div>
      )}

      {/* Submitting overlay: please wait, request is sending */}
      {submitting && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(10px)' }}
          aria-live="polite"
          aria-busy="true"
        >
          <div
            className="max-w-sm w-full rounded-2xl p-6 sm:p-8 text-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(165deg, #ffffff 0%, #f8faf9 50%, #f0f7f2 100%)',
              boxShadow: '0 0 0 1px rgba(114,164,127,0.2) inset, 0 25px 50px -12px rgba(0,0,0,0.25), 0 12px 24px -8px rgba(93,138,106,0.2)',
            }}
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-power-400 via-green-power-500 to-green-power-600" aria-hidden />
            <div
              className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-5 shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
                boxShadow: '0 8px 24px rgba(93, 138, 106, 0.45)',
              }}
            >
              <svg className="w-8 h-8 animate-spin text-white" fill="none" viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" fill="none" />
                <path fill="currentColor" d="M12 2a10 10 0 0110 10h-4a6 6 0 00-6-6V2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 tracking-tight">
              {t('offer.sendingRequestTitle')}
            </h3>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              {t('offer.sendingRequestMessage')}
            </p>
            <div className="mt-6 w-full h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="offer-submit-progress-bar h-full rounded-full bg-gradient-to-r from-green-power-400 via-green-power-500 to-green-power-600"
                style={{
                  boxShadow: '0 0 12px rgba(114, 164, 127, 0.5)',
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-3 font-medium">{t('offer.dontCloseWindow')}</p>
          </div>
        </div>
      )}

      {/* Success popup after submitting the offer request */}
      {submitStatus === 'success' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(8px)' }}
          onClick={() => setSubmitStatus('idle')}
        >
          <div
            className="max-w-md w-full rounded-2xl p-6 sm:p-8 text-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(165deg, #ffffff 0%, #f8faf9 50%, #f0f7f2 100%)',
              boxShadow: '0 0 0 1px rgba(114,164,127,0.15) inset, 0 25px 50px -12px rgba(0,0,0,0.2), 0 12px 24px -8px rgba(93,138,106,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-green-power-400 via-green-power-500 to-green-power-600" aria-hidden />
            <div
              className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 text-white shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
                boxShadow: '0 8px 20px rgba(93, 138, 106, 0.4)',
              }}
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h4 className="text-xl font-bold text-gray-900 tracking-tight">{t('offer.successTitle')}</h4>
            <p className="text-sm text-gray-600 mt-2">{t('offer.successMessage')}</p>
            <button
              type="button"
              onClick={() => setSubmitStatus('idle')}
              className="mt-6 inline-flex items-center justify-center px-6 py-3 rounded-xl text-white text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
              style={{
                background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
                boxShadow: '0 4px 14px rgba(93, 138, 106, 0.35)',
              }}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
