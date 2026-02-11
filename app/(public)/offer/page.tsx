'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

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

  function openModal(img: GalleryImage) {
    setModalImage(img);
    const opts = img.offerColorOptions ?? [];
    setModalColor(opts[0] ?? '');
    setModalMeters('');
    setModalPieces('');
  }

  function closeModal() {
    setModalImage(null);
  }

  function addToCart() {
    if (!modalImage) return;
    const color = modalColor.trim() || (modalImage.offerColorOptions?.[0] ?? '');
    setCart((prev) => [
      ...prev,
      {
        imageId: modalImage.id,
        imageUrl: modalImage.url,
        itemName: modalImage.offerItemName ?? modalImage.title ?? modalImage.category ?? 'Item',
        color,
        quantityMeters: modalMeters.trim(),
        quantityPieces: modalPieces.trim(),
      },
    ]);
    closeModal();
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
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
      const res = await fetch(`${base}/api/offers/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          mobile: mobile.trim(),
          address: address.trim(),
          items: cart.map((item) => ({
            imageId: item.imageId,
            imageUrl: item.imageUrl,
            itemName: item.itemName,
            color: item.color,
            quantityMeters: item.quantityMeters || undefined,
            quantityPieces: item.quantityPieces || undefined,
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

  return (
    <div className="relative z-10 flex flex-1 flex-col w-full px-3 sm:px-4 pt-2 sm:pt-3 pb-2 sm:pb-3 overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 sm:gap-6">
        <div
          className="rounded-2xl overflow-hidden border border-white/80 p-4 sm:p-6"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(248,252,249,0.65) 100%)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.6) inset, 0 12px 40px rgba(0,0,0,0.08)',
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-green-power-700 hover:text-green-power-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('offer.backToGallery')}
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('offer.title')}</h1>
          <p className="text-sm text-gray-600 mt-0.5">{t('offer.subtitle')}</p>

          {cart.length === 0 &&
            (loading ? (
              <p className="text-gray-500 py-8 text-sm">{t('common.loading')}</p>
            ) : offerImages.length === 0 ? (
              <p className="text-gray-600 py-8 text-sm">{t('offer.noEligibleProducts')}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                {offerImages.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => openModal(img)}
                    className="block w-full text-left rounded-xl border border-white/60 bg-white/50 shadow-md hover:shadow-lg hover:border-green-power-200/60 transition-all focus:outline-none focus:ring-2 focus:ring-green-power-500 overflow-hidden"
                  >
                    <div className="relative aspect-square overflow-hidden">
                      <img src={img.url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform" />
                    </div>
                    <div className="p-2 bg-white/90">
                      <p className="text-xs font-medium text-gray-900 line-clamp-2">
                        {img.offerItemName || img.title || getDisplayName(img.category)}
                      </p>
                      <span className="text-[10px] text-green-power-600 font-medium mt-0.5 inline-block">
                        {t('offer.requestQuote')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ))}

          {cart.length > 0 && (
            <form onSubmit={handleSubmit} className="mt-6 pt-6 border-t border-gray-200/80">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('offer.myOfferRequest')}</h2>
              <ul className="space-y-2 mb-4">
                {cart.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm bg-gray-50/80 rounded-lg p-2 border border-gray-100"
                  >
                    <img src={item.imageUrl} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{item.itemName}</p>
                      <p className="text-gray-600 text-xs">
                        {item.color}
                        {item.quantityMeters && ` · ${item.quantityMeters} m`}
                        {item.quantityPieces && ` · ${item.quantityPieces} pcs`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(i)}
                      className="text-red-600 hover:text-red-700 text-xs font-medium flex-shrink-0"
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
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
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
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
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
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
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
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
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
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                />
              </div>
              {submitStatus === 'success' && (
                <p className="text-green-700 text-sm font-medium mb-3">{t('offer.successMessage')}</p>
              )}
              {submitStatus === 'error' && (
                <p className="text-red-600 text-sm font-medium mb-3">{t('offer.errorMessage')}</p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-green-power-600 text-white font-medium shadow-lg hover:bg-green-power-700 disabled:opacity-70 transition-colors"
              >
                {submitting ? t('offer.submitting') : t('offer.submit')}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Add-to-offer modal */}
      {modalImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t('offer.addToOffer')}</h3>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                aria-label={t('common.close')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-4">
              <img src={modalImage.url} alt="" className="w-full aspect-video object-cover rounded-lg" />
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.itemName')}</label>
                <p className="text-sm text-gray-900">
                  {modalImage.offerItemName || modalImage.title || getDisplayName(modalImage.category)}
                </p>
              </div>
              {(modalImage.offerColorOptions?.length ?? 0) > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.color')}</label>
                  <select
                    value={modalColor}
                    onChange={(e) => setModalColor(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                  >
                    {modalImage.offerColorOptions!.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.quantityMeters')}</label>
                <input
                  type="text"
                  value={modalMeters}
                  onChange={(e) => setModalMeters(e.target.value)}
                  placeholder={t('offer.quantityMetersPlaceholder')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.quantityPieces')}</label>
                <input
                  type="text"
                  value={modalPieces}
                  onChange={(e) => setModalPieces(e.target.value)}
                  placeholder={t('offer.quantityPiecesPlaceholder')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={addToCart}
                className="flex-1 py-2.5 rounded-xl bg-green-power-600 text-white font-medium hover:bg-green-power-700"
              >
                {t('offer.addToOffer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success popup after submitting the offer request */}
      {submitStatus === 'success' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setSubmitStatus('idle')}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto w-12 h-12 rounded-full bg-green-power-100 text-green-power-700 flex items-center justify-center mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900">{t('offer.successTitle')}</h4>
            <p className="text-sm text-gray-600 mt-1">{t('offer.successMessage')}</p>
            <button
              type="button"
              onClick={() => setSubmitStatus('idle')}
              className="mt-4 inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-green-power-600 text-white text-sm font-medium hover:bg-green-power-700"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
