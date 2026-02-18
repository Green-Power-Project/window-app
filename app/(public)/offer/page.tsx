'use client';

import { useState, useEffect, useCallback, useRef, type PointerEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGalleryCategoryLabels } from '@/lib/galleryCategoryLabels';
import { db } from '@/lib/firebase';
import { getGalleryImages, type GalleryImage } from '@/lib/galleryClient';
import { getOfferFolders, getOfferItems, type OfferFolder, type OfferCatalogItem } from '@/lib/offerCatalogClient';
import { getAdminPanelBaseUrl } from '@/lib/adminPanelUrl';
import { getAndClearOfferScreenshot } from '@/lib/offerScreenshotStore';
import { OFFERS_CATEGORY_KEY } from '@/lib/galleryConstants';
import OfferGalleryCard from '@/components/OfferGalleryCard';

interface CartItem {
  itemType: 'gallery' | 'folder';
  imageId?: string;
  offerItemId?: string;
  imageUrl: string;
  itemName: string;
  color: string;
  quantityMeters: string;
  quantityPieces: string;
  quantityUnit?: string;
  /** Selected dimension line (e.g. "Width 10 cm, Length 20 cm, thickness 3 cm") */
  dimension?: string;
  /** Per-item comment from add modal */
  note?: string;
  /** Cloudinary URLs after submit; set when uploading item photos on submit */
  photoUrls?: string[];
  /** Local files for this item (uploaded on form submit) */
  photoFiles?: File[];
  /** Object URLs for preview in cart; revoked when item removed or after submit */
  photoPreviewUrls?: string[];
  /** Price for PDF (gallery: offerPrice, catalog: price) */
  price?: string;
}

export default function OfferPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const { categoryKeys, getDisplayName } = useGalleryCategoryLabels();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<OfferFolder[]>([]);
  const [catalogItems, setCatalogItems] = useState<OfferCatalogItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [modalImage, setModalImage] = useState<GalleryImage | null>(null);
  const [modalCatalogItem, setModalCatalogItem] = useState<OfferCatalogItem | null>(null);
  const [modalCatalogPieces, setModalCatalogPieces] = useState('');
  const [modalCatalogNote, setModalCatalogNote] = useState('');
  const [modalCatalogPhotoFiles, setModalCatalogPhotoFiles] = useState<File[]>([]);
  const [modalCatalogPhotoPreviews, setModalCatalogPhotoPreviews] = useState<string[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [modalColor, setModalColor] = useState('');
  const [modalMeters, setModalMeters] = useState('');
  const [modalPieces, setModalPieces] = useState('');
  const [modalDimension, setModalDimension] = useState('');
  const [modalNote, setModalNote] = useState('');
  const [modalPhotoFiles, setModalPhotoFiles] = useState<File[]>([]);
  const [modalPhotoPreviews, setModalPhotoPreviews] = useState<string[]>([]);
  const [modalPhotoError, setModalPhotoError] = useState<string | null>(null);
  const [modalQuantityError, setModalQuantityError] = useState<string | null>(null);
  const [modalCatalogQuantityError, setModalCatalogQuantityError] = useState<string | null>(null);
  const [modalDescExpanded, setModalDescExpanded] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [requestProjectNote, setRequestProjectNote] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [lightbox, setLightbox] = useState<{ url: string; image: GalleryImage | null } | null>(null);
  /** E-commerce flow: 'browse' = add items; 'cart' = review & submit */
  const [offerView, setOfferView] = useState<'browse' | 'cart'>('browse');
  /** When true, we've finished the fromScreenshot=1 flow (applied screenshot or found none) – stop showing loading */
  const [screenshotFlowResolved, setScreenshotFlowResolved] = useState(false);
  const [mobileOfferTab, setMobileOfferTab] = useState<'offers' | 'catalog'>('offers');
  /** When null, show offer categories; when set, show offer images for that category */
  const [selectedOfferCategory, setSelectedOfferCategory] = useState<string | null>(null);
  const rightSectionRef = useRef<HTMLDivElement>(null);
  const productGridRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const galleryPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const catalogPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const projectPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [projectPhotoFiles, setProjectPhotoFiles] = useState<File[]>([]);
  const [projectPhotoPreviewUrls, setProjectPhotoPreviewUrls] = useState<string[]>([]);

  // Long-press (1s) on the opened lightbox image starts the "Add item" flow.
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextLightboxClickRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const startLongPress = useCallback(
    (e: PointerEvent<HTMLImageElement>) => {
      if (!lightbox?.image) return;
      // Only primary mouse button.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearLongPress();
      longPressStartRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = window.setTimeout(() => {
        suppressNextLightboxClickRef.current = true;
        const img = lightbox.image;
        if (!img) return;
        setLightbox(null);
        openModal(img);
      }, 1000);
    },
    [clearLongPress, lightbox]
  );

  const moveLongPress = useCallback(
    (e: PointerEvent<HTMLImageElement>) => {
      if (!longPressStartRef.current) return;
      const dx = Math.abs(e.clientX - longPressStartRef.current.x);
      const dy = Math.abs(e.clientY - longPressStartRef.current.y);
      if (dx > 10 || dy > 10) clearLongPress();
    },
    [clearLongPress]
  );

  const offerImages = images.filter(
    (img) => img.category === OFFERS_CATEGORY_KEY || img.offerEligible === true
  );

  /** Unique categories that have at least one offer image, ordered by categoryKeys */
  const offerCategories = (() => {
    const set = new Set(offerImages.map((img) => img.category).filter(Boolean) as string[]);
    return categoryKeys.filter((k) => set.has(k));
  })();

  /** One image per category for offer category cards */
  const offerCategoryRowItems: { category: string; image: GalleryImage }[] = offerCategories.map(
    (category) => ({
      category,
      image: offerImages.find((img) => img.category === category)!,
    })
  );

  /** Offer images for the currently selected category (when selectedOfferCategory is set) */
  const filteredOfferImages =
    selectedOfferCategory == null
      ? []
      : offerImages.filter((img) => img.category === selectedOfferCategory);

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

  const loadFolders = useCallback(async () => {
    try {
      setFoldersLoading(true);
      const list = await getOfferFolders(db);
      setFolders(list);
    } catch (error) {
      console.error('Error loading offer folders:', error);
      setFolders([]);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // When cart becomes empty, show browse view (e.g. after removing last item)
  useEffect(() => {
    if (cart.length === 0) setOfferView('browse');
  }, [cart.length]);

  // If user arrived with a screenshot (from "Screenshot & request quote" FAB), add it to cart and show inquiry summary only
  const screenshotAppliedRef = useRef(false);
  useEffect(() => {
    if (searchParams.get('fromScreenshot') !== '1') {
      setScreenshotFlowResolved(true);
      return;
    }
    if (screenshotAppliedRef.current) {
      setScreenshotFlowResolved(true);
      return;
    }
    const screenshot = getAndClearOfferScreenshot();
    if (!screenshot) {
      setScreenshotFlowResolved(true);
      router.replace('/offer', { scroll: false });
      return;
    }
    screenshotAppliedRef.current = true;
    const item: CartItem = {
      itemType: 'gallery',
      imageUrl: '',
      itemName: t('offer.screenshotItemName'),
      color: '',
      quantityMeters: '',
      quantityPieces: '',
      photoFiles: [screenshot.file],
      photoPreviewUrls: [screenshot.previewUrl],
    };
    setCart((prev) => [...prev, item]);
    setOfferView('cart');
    setScreenshotFlowResolved(true);
  }, [searchParams, router, t]);

  // Clean fromScreenshot from URL once we're on cart so user sees Inquiry summary and URL is stable
  useEffect(() => {
    if (offerView === 'cart' && searchParams.get('fromScreenshot') === '1') {
      router.replace('/offer', { scroll: false });
    }
  }, [offerView, searchParams, router]);

  const loadCatalogItems = useCallback(async (folderId: string) => {
    try {
      const list = await getOfferItems(db, folderId);
      setCatalogItems(list);
    } catch (error) {
      console.error('Error loading offer items:', error);
      setCatalogItems([]);
    }
  }, []);

  useEffect(() => {
    if (selectedFolderId) {
      loadCatalogItems(selectedFolderId);
      const folder = folders.find((f) => f.id === selectedFolderId);
      if (folder?.parentId) {
        setExpandedFolderIds((prev) => new Set(prev).add(folder.parentId!));
      }
    } else {
      setCatalogItems([]);
    }
  }, [selectedFolderId, loadCatalogItems, folders]);

  const rootFolders = folders.filter((f) => !f.parentId);
  const getChildFolders = (parentId: string) =>
    folders.filter((f) => f.parentId === parentId);

  const toggleFolder = (id: string) => {
    setExpandedFolderIds((prev) => {
      const isCurrentlyExpanded = prev.has(id);

      // Accordion behaviour: only one folder expanded at a time.
      if (isCurrentlyExpanded) {
        return new Set<string>();
      }

      const next = new Set<string>();
      next.add(id);
      return next;
    });

    // When expanding a folder that has children, automatically select its first child
    // if none of its children are currently selected.
    const children = getChildFolders(id);
    if (children.length > 0) {
      setSelectedFolderId((prev) => {
        if (prev && children.some((c) => c.id === prev)) {
          return prev;
        }
        return children[0].id;
      });
    } else {
      // No children – selecting the folder itself shows its items.
      setSelectedFolderId(id);
    }
  };

  function openCatalogItemModal(item: OfferCatalogItem) {
    setModalCatalogItem(item);
    setModalCatalogPieces('');
    setModalCatalogNote('');
    setModalCatalogPhotoPreviews((prev) => {
      prev.forEach(URL.revokeObjectURL);
      return [];
    });
    setModalCatalogPhotoFiles([]);
  }

  function closeCatalogItemModal() {
    setModalCatalogPhotoPreviews((prev) => {
      prev.forEach(URL.revokeObjectURL);
      return [];
    });
    setModalCatalogItem(null);
  }

  function addToCartFromCatalog() {
    if (!modalCatalogItem) return;
    if (!modalCatalogPieces.trim()) {
      setModalCatalogQuantityError(t('offer.validationQuantity'));
      return;
    }
    const hasPhotos = modalCatalogPhotoFiles.length > 0;
    const qtyUnit = modalCatalogItem.quantityUnit?.trim() || 'pieces';
    setCart((prev) => [
      ...prev,
      {
        itemType: 'folder' as const,
        offerItemId: modalCatalogItem.id,
        imageUrl: modalCatalogItem.imageUrl ?? '',
        itemName: modalCatalogItem.name,
        color: '',
        quantityMeters: '',
        quantityPieces: modalCatalogPieces.trim(),
        quantityUnit: qtyUnit,
        note: modalCatalogNote.trim() || undefined,
        photoFiles: hasPhotos ? [...modalCatalogPhotoFiles] : undefined,
        photoPreviewUrls: hasPhotos ? [...modalCatalogPhotoPreviews] : undefined,
        price: modalCatalogItem.price?.trim() || undefined,
      },
    ]);
    setModalCatalogPhotoPreviews([]);
    setModalCatalogPhotoFiles([]);
    setModalCatalogItem(null);
  }

  const modalDescription = modalImage
    ? modalImage.title || getDisplayName(modalImage.category)
    : '';
  const MAX_DESCRIPTION_CHARS = 220;
  const isLongModalDescription = modalDescription.length > MAX_DESCRIPTION_CHARS;
  const visibleModalDescription =
    !isLongModalDescription || modalDescExpanded
      ? modalDescription
      : modalDescription
          .slice(0, MAX_DESCRIPTION_CHARS)
          .replace(/\s+\S*$/, '') + '…';

  const quantityUnitDisplay = modalImage?.offerQuantityUnit?.trim()
    ? (['pieces', 'metres', 'centimetres', 'litres'].includes(modalImage.offerQuantityUnit)
        ? t(`offer.quantityUnit_${modalImage.offerQuantityUnit}`)
        : modalImage.offerQuantityUnit)
    : t('offer.quantityUnit_pieces');

  function openModal(img: GalleryImage) {
    setModalImage(img);
    const opts = img.offerColorOptions ?? [];
    setModalColor(opts[0] ?? '');
    setModalMeters('');
    setModalPieces('');
    setModalDimension('');
    setModalNote('');
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
    if (!modalPieces.trim()) {
      setModalQuantityError(t('offer.validationQuantity'));
      return;
    }

    const color = modalColor.trim() || (modalImage.offerColorOptions?.[0] ?? '');
    const hasPhotos = modalPhotoFiles.length > 0;
    const qtyUnit = modalImage.offerQuantityUnit?.trim()
      ? (['pieces', 'metres', 'centimetres', 'litres'].includes(modalImage.offerQuantityUnit!)
          ? modalImage.offerQuantityUnit
          : modalImage.offerQuantityUnit)
      : 'pieces';
    setCart((prev) => [
      ...prev,
      {
        itemType: 'gallery' as const,
        imageId: modalImage.id,
        imageUrl: modalImage.url,
        itemName: modalImage.title || getDisplayName(modalImage.category) || 'Item',
        color,
        quantityMeters: modalMeters.trim(),
        quantityPieces: modalPieces.trim(),
        quantityUnit: qtyUnit,
        dimension: modalDimension.trim() || undefined,
        note: modalNote.trim() || undefined,
        photoFiles: hasPhotos ? [...modalPhotoFiles] : undefined,
        photoPreviewUrls: hasPhotos ? [...modalPhotoPreviews] : undefined,
        price: modalImage.offerPrice?.trim() || undefined,
      },
    ]);
    setModalPhotoPreviews([]);
    setModalPhotoFiles([]);
    setModalPhotoError(null);
    setModalImage(null);
  }

  function closeModal() {
    setModalPhotoPreviews((prev) => {
      prev.forEach(URL.revokeObjectURL);
      return [];
    });
    setModalPhotoFiles([]);
    setModalPhotoError(null);
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
      const itemsPayload: Array<{
        itemType?: 'gallery' | 'folder';
        imageId?: string;
        offerItemId?: string;
        imageUrl: string;
        itemName: string;
        color: string;
        quantityMeters?: string;
        quantityPieces?: string;
        dimension?: string;
        note?: string;
        photoUrls?: string[];
        price?: string;
      }> = [];
      for (const item of cart) {
        let photoUrls: string[] | undefined;
        if (item.photoFiles?.length) {
          photoUrls = await uploadFilesToCloudinary(item.photoFiles);
          if (item.photoPreviewUrls?.length) {
            item.photoPreviewUrls.forEach(URL.revokeObjectURL);
          }
        }
        itemsPayload.push({
          itemType: item.itemType,
          imageId: item.imageId,
          offerItemId: item.offerItemId,
          imageUrl: item.imageUrl || '',
          itemName: item.itemName,
          color: item.color,
          quantityMeters: item.quantityMeters || undefined,
          quantityPieces: item.quantityPieces || undefined,
          dimension: item.dimension,
          note: item.note,
          photoUrls: photoUrls?.length ? photoUrls : undefined,
          price: item.price?.trim() || undefined,
        });
      }
      let projectPhotoUrls: string[] | undefined;
      if (projectPhotoFiles.length > 0) {
        projectPhotoUrls = await uploadFilesToCloudinary(projectPhotoFiles);
        projectPhotoPreviewUrls.forEach(URL.revokeObjectURL);
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
          projectNote: requestProjectNote.trim() || undefined,
          projectPhotoUrls: projectPhotoUrls?.length ? projectPhotoUrls : undefined,
          items: itemsPayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSubmitStatus('success');
        setCart([]);
        setRequestProjectNote('');
        setFirstName('');
        setLastName('');
        setEmail('');
        setMobile('');
        setAddress('');
        setProjectPhotoFiles([]);
        setProjectPhotoPreviewUrls((prev) => {
          prev.forEach(URL.revokeObjectURL);
          return [];
        });
        setOfferView('browse');
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
      <h2 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2">
        <span className="w-1 h-5 rounded-full bg-gradient-to-b from-green-power-400 to-green-power-600" />
        {t('offer.myOfferRequest')}
      </h2>

      {/* Added items – column layout with image, details, optional item photos */}
      <div className="space-y-3">
        {cart.map((item, i) => {
          const parts: string[] = [];
          if (item.itemType === 'gallery') {
            if (item.color?.trim()) parts.push(item.color.trim());
            if (item.dimension?.trim()) parts.push(item.dimension.trim());
            if (item.quantityMeters?.trim()) parts.push(`${item.quantityMeters} m`);
            if (item.quantityPieces?.trim()) parts.push(`${item.quantityPieces} ${item.quantityUnit || 'pcs'}`);
          } else {
            if (item.quantityPieces?.trim()) parts.push(`${item.quantityPieces} ${item.quantityUnit || 'pcs'}`);
            if (item.color?.trim()) parts.push(item.color.trim());
            if (item.dimension?.trim()) parts.push(item.dimension.trim());
            if (item.quantityMeters?.trim()) parts.push(`${item.quantityMeters} m`);
          }
          const subtitle = parts.join(' · ');
          const hasItemImage = item.imageUrl || (item.photoPreviewUrls?.length ?? 0) > 0;
          const mainImageUrl = item.imageUrl || item.photoPreviewUrls?.[0];
          return (
            <div
              key={`${item.itemType}-${item.itemName}-${i}`}
              className="relative flex flex-row gap-4 rounded-xl border border-gray-100 bg-gray-50/80 p-3 sm:p-4 overflow-hidden"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              {hasItemImage && mainImageUrl && (
                <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-200 ring-1 ring-black/5">
                  <button
                    type="button"
                    onClick={() => setLightbox({ url: mainImageUrl, image: null })}
                    className="w-full h-full block cursor-zoom-in"
                  >
                    <img src={mainImageUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="text-sm font-semibold text-gray-900 leading-tight" title={item.itemName}>
                  {item.itemName}
                </p>
                {subtitle ? (
                  <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>
                ) : null}
                {(item.photoPreviewUrls?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.photoPreviewUrls!.slice(0, 4).map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLightbox({ url, image: null }); }}
                        className="w-8 h-8 rounded overflow-hidden ring-1 ring-black/10 flex-shrink-0 cursor-zoom-in"
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                    {item.photoPreviewUrls!.length > 4 && (
                      <span className="text-xs text-gray-500 self-center">+{item.photoPreviewUrls!.length - 4}</span>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeFromCart(i)}
                className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow hover:bg-red-600 transition-colors absolute top-2 right-2 sm:relative sm:top-0 sm:right-0"
                aria-label={t('offer.remove')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          );
        })}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.projectNote')}</label>
        <textarea
          value={requestProjectNote}
          onChange={(e) => setRequestProjectNote(e.target.value)}
          placeholder={t('offer.projectNotePlaceholder')}
          rows={3}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-power-500/50 focus:border-green-power-500 transition-shadow resize-y"
        />
      </div>

      {/* Project images – max 5 */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">{t('offer.projectPhotos')}</label>
        <p className="text-[11px] text-gray-500 mb-2">{t('offer.projectPhotosHint')}</p>
        <input
          ref={projectPhotoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (!files.length) return;
            setProjectPhotoFiles((prev) => {
              const toAdd = files.slice(0, Math.max(0, 5 - prev.length));
              if (toAdd.length === 0) return prev;
              const next = [...prev, ...toAdd].slice(0, 5);
              setProjectPhotoPreviewUrls((urls) => {
                urls.forEach(URL.revokeObjectURL);
                return next.map((f) => URL.createObjectURL(f));
              });
              return next;
            });
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => projectPhotoInputRef.current?.click()}
            disabled={projectPhotoFiles.length >= 5}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-green-power-300 text-green-power-700 text-sm font-medium hover:bg-green-power-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" /></svg>
            {projectPhotoFiles.length >= 5 ? t('offer.itemPhotosChosen', { count: 5 }) : t('offer.itemPhotosChoose')}
          </button>
          {projectPhotoPreviewUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {projectPhotoPreviewUrls.map((url, idx) => (
                <div key={idx} className="relative group/preview">
                  <button
                    type="button"
                    onClick={() => setLightbox({ url, image: null })}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden ring-1 ring-black/10 cursor-zoom-in block"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(url);
                      setProjectPhotoPreviewUrls((prev) => prev.filter((_, i) => i !== idx));
                      setProjectPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow hover:bg-red-600"
                    aria-label={t('offer.remove')}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
      <div>
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
      <div>
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
      <div>
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
      {(submitStatus === 'success' || submitStatus === 'error') && (
        <p className={`text-sm font-medium ${submitStatus === 'success' ? 'text-green-power-700' : 'text-red-600'}`}>
          {submitStatus === 'success' ? t('offer.successMessage') : t('offer.errorMessage')}
        </p>
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

  // Show loading until the screenshot effect has run (then we show cart if we had a screenshot, or browse if not)
  const fromScreenshot = searchParams.get('fromScreenshot') === '1';
  if (fromScreenshot && offerView !== 'cart' && !screenshotFlowResolved) {
    return (
      <div className="relative z-10 flex flex-1 flex-col w-full min-h-screen items-center justify-center px-4 bg-green-power-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-green-power-600 border-t-transparent" aria-hidden />
          <p className="text-gray-700 font-medium">{t('offer.preparingRequest')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {offerView === 'cart' ? (
        /* Dedicated cart page: review items, fill form, submit */
        <div className="relative z-10 flex flex-1 flex-col w-full min-h-screen px-3 sm:px-4 pt-4 sm:pt-6 pb-6 overflow-y-auto">
          <div className="w-full mx-auto max-w-2xl flex flex-col gap-5 sm:gap-6">
            <header className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setOfferView('browse')}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-green-power-700 transition-colors bg-white/95 backdrop-blur-sm px-3 py-2 rounded-xl shadow-sm border border-gray-200/80 hover:border-green-power-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {t('common.back')}
              </button>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
                {t('offer.title')} → {t('offer.cart')}
              </h1>
            </header>
            <div
              className="rounded-2xl overflow-hidden border border-gray-200/90 bg-white/95 backdrop-blur-sm shadow-xl"
              style={{
                boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.08)',
              }}
            >
              <div className="h-1 w-full bg-gradient-to-r from-green-power-400 via-green-power-500 to-green-power-600" aria-hidden />
              <div className="p-4 sm:p-6 lg:p-8">
                {cart.length === 0 ? (
                  <div className="py-14 text-center">
                    <p className="text-gray-600 mb-5">{t('offer.cartEmpty')}</p>
                    <button
                      type="button"
                      onClick={() => setOfferView('browse')}
                      className="px-5 py-2.5 rounded-xl font-semibold text-white hover:shadow-lg transition-all"
                      style={{ background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' }}
                    >
                      {t('offer.continueShopping')}
                    </button>
                  </div>
                ) : (
                  <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
                    {formSection}
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Browse: full-width catalog + gallery; go to cart when done adding */
        <div className="relative z-10 flex flex-1 flex-col w-full px-3 sm:px-4 pt-2 sm:pt-3 pb-2 sm:pb-3 overflow-y-auto">
          <div
            className={`w-full mx-auto flex flex-col gap-4 sm:gap-6 ${rootFolders.length === 0 ? 'max-w-4xl' : 'max-w-7xl'}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-green-power-700 transition-colors bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-sm border border-white/50 w-fit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {t('common.back')}
              </button>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">{t('offer.title')}</h1>
              <div className="flex items-center gap-3 order-last sm:order-none">
                <p className="text-sm text-gray-800 font-medium max-w-xl bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-sm border border-white/50">
                  {t('offer.subtitle')}
                </p>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOfferView('cart')}
                    className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-white shadow-lg hover:shadow-md transition-all bg-white/90 backdrop-blur-sm border border-white/50"
                    style={{
                      background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
                      boxShadow: '0 2px 8px rgba(93, 138, 106, 0.4)',
                    }}
                  >
                    {t('offer.cart')} ({cart.length})
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

        {/* Mobile: tabs to switch between Offers and Catalogues (only when both exist) */}
        {rootFolders.length > 0 && (
          <div className="flex gap-1 p-1.5 bg-gray-100 rounded-xl border border-gray-200">
            <button
              type="button"
              onClick={() => setMobileOfferTab('offers')}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors ${
                mobileOfferTab === 'offers'
                  ? 'bg-white text-green-power-700 shadow-sm border border-gray-200'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t('offer.tabOffers')}
            </button>
            <button
              type="button"
              onClick={() => setMobileOfferTab('catalog')}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors ${
                mobileOfferTab === 'catalog'
                  ? 'bg-white text-green-power-700 shadow-sm border border-gray-200'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t('offer.tabCatalog')}
            </button>
          </div>
        )}

        {/* Browse products: show either the Offers gallery or the Offer catalog, using the full width. */}
        <div className="flex flex-col gap-4">
          {/* Offers gallery – shown when Offers tab is active (or when there are no folders) */}
          <div
            className={`min-w-0 flex flex-col w-full ${
              rootFolders.length > 0 && mobileOfferTab === 'catalog' ? 'hidden' : ''
            }`}
          >
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden h-full flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-green-power-50 to-green-power-100 flex-shrink-0">
                <h2 className="text-sm font-bold text-gray-900">{t('offer.title')}</h2>
                <p className="text-xs text-gray-600 mt-0.5">{t('offer.subtitle')}</p>
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-4">
                {loading ? (
                  <p className="text-gray-500 py-8 text-sm">{t('common.loading')}</p>
                ) : offerImages.length === 0 ? (
                  <p className="text-gray-600 py-8 text-sm">{t('offer.noEligibleProducts')}</p>
                ) : selectedOfferCategory != null ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedOfferCategory(null)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-green-power-700 hover:text-green-power-800 mb-4 focus:outline-none focus:ring-2 focus:ring-green-power-400 focus:ring-offset-1 rounded-lg"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      {t('gallery.backToCategories')}
                    </button>
                    <h3 className="text-base font-bold text-gray-900 tracking-tight mb-3">
                      {getDisplayName(selectedOfferCategory)} ({filteredOfferImages.length})
                    </h3>
                    <div ref={productGridRef} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 scroll-mt-4">
                      {filteredOfferImages.map((img) => (
                        <OfferGalleryCard
                          key={img.id}
                          img={img}
                          title={img.title || getDisplayName(img.category)}
                          priceText={undefined}
                          onRequestQuote={openModal}
                          onImageClick={(image) => setLightbox({ url: image.url, image })}
                          buttonLabel="Add item"
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 min-w-0">
                    {offerCategoryRowItems.map(({ category, image }) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setSelectedOfferCategory(category)}
                        className="group flex flex-col focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 overflow-hidden transition-all duration-300 rounded-xl bg-white border border-gray-100 min-w-0 hover:shadow-lg active:scale-[0.98] text-left"
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
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Offer catalog – only when folders exist and Catalog tab is active */}
          {rootFolders.length > 0 && (
              <div
                className={`w-full ${
                  mobileOfferTab === 'offers' ? 'hidden' : ''
                }`}
              >
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden h-full flex flex-col">
                  <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-green-power-50 to-green-power-100 flex-shrink-0">
                    <h2 className="text-sm font-bold text-gray-900">{t('offer.offerCatalog')}</h2>
                    <p className="text-xs text-gray-600 mt-0.5">{t('offer.offerCatalogHint')}</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto p-4 flex flex-col md:flex-row gap-4">
                    {/* Folder tree – left column */}
                    <div className="flex-shrink-0 md:w-[260px]">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                        {t('offer.offerCatalog')}
                      </p>
                      {foldersLoading ? (
                        <p className="text-xs text-gray-500 py-3">{t('common.loading')}</p>
                      ) : (
                        <div className="space-y-0.5 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/50">
                          {rootFolders.map((folder) => {
                            const children = getChildFolders(folder.id);
                            const isExpanded = expandedFolderIds.has(folder.id);
                            const hasChildSelected = children.some((c) => c.id === selectedFolderId);
                            return (
                              <div key={folder.id} className="border-b border-gray-100 last:border-b-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => toggleFolder(folder.id)}
                                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-200/80 hover:text-gray-700 transition-colors"
                                    aria-expanded={children.length > 0 ? isExpanded : undefined}
                                  >
                                    {children.length > 0 ? (
                                      <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    ) : (
                                      <span className="w-4 block" aria-hidden />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleFolder(folder.id)}
                                    className={`flex-1 min-w-0 text-left px-3 py-2.5 text-sm font-medium rounded-md transition-colors truncate flex items-center gap-2 ${
                                      hasChildSelected
                                        ? 'bg-green-power-100 text-green-power-800'
                                        : 'text-gray-800 hover:bg-gray-100'
                                    }`}
                                  >
                                    <span className="shrink-0 text-base opacity-80" aria-hidden>📁</span>
                                    <span className="truncate">{folder.name || t('common.untitledFile')}</span>
                                  </button>
                                </div>
                                {children.length > 0 && isExpanded && (
                                  <div className="ml-6 pl-4 py-1.5 border-l-2 border-green-power-200 space-y-0.5 bg-white/60">
                                    {children.map((cf) => {
                                      const isChildSelected = selectedFolderId === cf.id;
                                      return (
                                        <button
                                          key={cf.id}
                                          type="button"
                                          onClick={() => setSelectedFolderId(cf.id)}
                                          className={`block w-full text-left px-3 py-2 text-sm rounded-md transition-colors truncate ${
                                            isChildSelected
                                              ? 'bg-green-power-100 text-green-power-800 font-semibold'
                                              : 'text-gray-700 hover:bg-gray-100'
                                          }`}
                                        >
                                          {cf.name || t('common.untitledFile')}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {/* Selected folder items – right column */}
                    {selectedFolderId && (
                      <div className="flex-1 min-h-0 border-t border-gray-100 pt-4 md:border-t-0 md:border-l md:border-gray-100 md:pl-4">
                        <p className="text-xs font-semibold text-gray-700 mb-2">
                          {folders.find((f) => f.id === selectedFolderId)?.name || t('offer.offerCatalog')}
                        </p>
                        {catalogItems.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {catalogItems.map((item) => (
                              <div
                                key={item.id}
                                className="flex flex-col w-[120px] sm:w-[130px] rounded-lg border border-gray-100 bg-gray-50 overflow-hidden shadow-sm p-3"
                              >
                                <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">{item.name}</p>
                                {item.description && (
                                  <p className="text-xs text-gray-600 mt-1 line-clamp-2 leading-tight">{item.description}</p>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openCatalogItemModal(item)}
                                  className="mt-3 w-full py-1.5 px-2 rounded-lg text-[11px] font-semibold text-white"
                                  style={{ background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)' }}
                                >
                                  Add item →
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : !foldersLoading ? (
                          <p className="text-sm text-gray-500 py-4">{t('offer.noEligibleProducts')}</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
            <div className="mb-4 flex flex-col min-h-0 max-h-[85vh] sm:max-h-[60vh] overflow-y-auto">
              <div className="flex flex-col md:flex-row gap-4 md:gap-5 flex-1 min-h-0 md:min-h-[50vh]">
                {/* Left card: title (same as offer cards) + image + price + description */}
                <div
                  className="md:w-[48%] flex-1 rounded-xl p-3 flex flex-col gap-2 min-h-0 md:overflow-y-auto flex-shrink-0 md:flex-shrink"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(240,247,242,0.5) 100%)',
                    boxShadow: '0 0 0 1px rgba(114,164,127,0.12), 0 4px 12px rgba(0,0,0,0.04)',
                  }}
                >
                  <p className="text-lg font-bold text-gray-900 leading-tight" title={modalDescription}>
                    {modalImage.title || getDisplayName(modalImage.category)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setLightbox({ url: modalImage.url, image: modalImage })}
                    className="rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-black/5 block w-full cursor-zoom-in"
                  >
                    <img src={modalImage.url} alt="" className="w-full aspect-[4/3] object-cover" />
                  </button>
                  <div className="min-h-0">
                    <label className="block text-[11px] font-semibold text-black uppercase tracking-wider mb-1">{t('offer.itemName')}</label>
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

                {/* Right card: form fields; on mobile part of common scroll, on md scrolls separately */}
                <div
                  ref={rightSectionRef}
                  className="md:w-[48%] flex-1 min-h-0 rounded-xl p-3 space-y-2 md:overflow-y-auto flex-shrink-0 md:flex-shrink"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(240,247,242,0.5) 100%)',
                    boxShadow: '0 0 0 1px rgba(114,164,127,0.12), 0 4px 12px rgba(0,0,0,0.04)',
                  }}
                >
                  {(modalImage.offerColorOptions?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-gray-700">{t('offer.color')}</label>
                      <div className="relative">
                        <select
                          value={modalColor}
                          onChange={(e) => setModalColor(e.target.value)}
                          className="w-full appearance-none rounded-xl border border-black/2 bg-white py-3 pl-3 pr-10 text-sm text-gray-800 shadow-sm transition-all placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black/20 hover:border-black"
                        >
                          <option value="">{t('offer.selectColor')}</option>
                          {modalImage.offerColorOptions!.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400" aria-hidden>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  )}
                  {(modalImage.offerDimensionOptions?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-gray-700">{t('offer.dimensions')}</label>
                      <div className="relative">
                        <select
                          value={modalDimension}
                          onChange={(e) => setModalDimension(e.target.value)}
                          className="w-full appearance-none rounded-xl border border-black/2 bg-white py-3 pl-3 pr-10 text-sm text-gray-800 shadow-sm transition-all placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black/20 hover:border-black"
                        >
                          <option value="">{t('offer.selectDimensions')}</option>
                          {modalImage.offerDimensionOptions!.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400" aria-hidden>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-700">
                      {t('offer.quantityLabel')} ({quantityUnitDisplay})
                    </label>
                    <input
                      type="text"
                      value={modalPieces}
                    onChange={(e) => {
                      setModalPieces(e.target.value);
                      if (modalQuantityError) setModalQuantityError(null);
                    }}
                      placeholder={t('offer.quantityPiecesPlaceholder')}
                      className="w-full max-w-[200px] rounded-xl border border-black/2 bg-white py-3 pl-3 pr-3 text-sm text-gray-800 shadow-sm transition-all placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black/20 hover:border-black"
                    />
                  {modalQuantityError && (
                    <p className="text-xs text-red-600 mt-1">{modalQuantityError}</p>
                  )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-700">
                      {t('offer.comment')}
                    </label>
                    <textarea
                      value={modalNote}
                      onChange={(e) => setModalNote(e.target.value)}
                      placeholder={t('offer.commentPlaceholder')}
                      rows={4}
                      className="w-full min-h-[100px] rounded-xl border border-black/2 bg-white py-3 px-3 text-sm text-gray-800 shadow-sm transition-all placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black/20 hover:border-black resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-0.5">
                      {t('offer.itemPhotos')}
                    </label>
                    <p className="text-xs text-gray-500 mb-1">
                      {t('offer.itemPhotosHintMax2')}
                    </p>
                    <input
                      ref={galleryPhotoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        e.target.value = '';
                        if (!files.length) return;
                        setModalPhotoError(null);
                        setModalPhotoFiles((prev) => {
                          const toAdd = files.slice(0, Math.max(0, 2 - prev.length));
                          if (toAdd.length === 0) return prev;
                          return [...prev, ...toAdd].slice(0, 2);
                        });
                        setModalPhotoPreviews((prev) => {
                          const toAdd = files.slice(0, Math.max(0, 2 - prev.length));
                          if (toAdd.length === 0) return prev;
                          const newPreviews = toAdd.map((f) => URL.createObjectURL(f));
                          return [...prev, ...newPreviews].slice(0, 2);
                        });
                      }}
                      className="sr-only"
                      aria-label={t('offer.itemPhotos')}
                    />
                    <button
                      type="button"
                      onClick={() => galleryPhotoInputRef.current?.click()}
                      disabled={modalPhotoFiles.length >= 2}
                      className="mt-1 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-green-power-300 text-green-power-700 text-sm font-medium hover:bg-green-power-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" /></svg>
                      {modalPhotoFiles.length > 0
                        ? t('offer.itemPhotosChosen', { count: modalPhotoFiles.length })
                        : t('offer.itemPhotosChoose')}
                    </button>
                    {modalPhotoError && (
                      <p className="text-xs text-red-600 mt-1">{modalPhotoError}</p>
                    )}
                    {modalPhotoPreviews.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {modalPhotoPreviews.map((url, idx) => (
                          <div key={idx} className="relative group">
                            <button
                              type="button"
                              onClick={() => setLightbox({ url, image: null })}
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
                              className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow hover:bg-red-600"
                              aria-label={t('offer.remove')}
                            >
                              ×
                            </button>
                          </div>
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
                Add item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Catalog item add-to-offer modal */}
      {modalCatalogItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(8px)' }}
          onClick={closeCatalogItemModal}
        >
          <div
            className="w-full max-w-2xl rounded-2xl p-4 sm:p-6 relative overflow-hidden"
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
                onClick={closeCatalogItemModal}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-xl hover:bg-gray-100/80 transition-colors"
                aria-label={t('common.close')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 rounded-xl p-4" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(240,247,242,0.5) 100%)' }}>
                <p className="text-lg font-bold text-gray-900 leading-tight">{modalCatalogItem.name}</p>
                {modalCatalogItem.description && (
                  <p className="text-sm text-gray-600 mt-2">{modalCatalogItem.description}</p>
                )}
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {t('offer.quantityLabel')} ({modalCatalogItem.quantityUnit?.trim() || t('offer.quantityUnit_pieces')})
                  </label>
                  <input
                    type="text"
                    value={modalCatalogPieces}
                    onChange={(e) => {
                      setModalCatalogPieces(e.target.value);
                      if (modalCatalogQuantityError) setModalCatalogQuantityError(null);
                    }}
                    placeholder={t('offer.quantityPiecesPlaceholder')}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  />
                  {modalCatalogQuantityError && (
                    <p className="text-xs text-red-600 mt-1">{modalCatalogQuantityError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t('offer.comment')}</label>
                  <textarea
                    value={modalCatalogNote}
                    onChange={(e) => setModalCatalogNote(e.target.value)}
                    placeholder={t('offer.commentPlaceholder')}
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-0.5">{t('offer.itemPhotos')}</label>
                  <p className="text-xs text-gray-500 mb-1">{t('offer.itemPhotosHintMax2')}</p>
                  <input
                    ref={catalogPhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = '';
                      if (!files.length) return;
                      setModalCatalogPhotoFiles((prev) => {
                        const toAdd = files.slice(0, Math.max(0, 2 - prev.length));
                        if (toAdd.length === 0) return prev;
                        return [...prev, ...toAdd].slice(0, 2);
                      });
                      setModalCatalogPhotoPreviews((prev) => {
                        const toAdd = files.slice(0, Math.max(0, 2 - prev.length));
                        if (toAdd.length === 0) return prev;
                        const newPreviews = toAdd.map((f) => URL.createObjectURL(f));
                        return [...prev, ...newPreviews].slice(0, 2);
                      });
                    }}
                    className="sr-only"
                    aria-label={t('offer.itemPhotos')}
                  />
                  <button
                    type="button"
                    onClick={() => catalogPhotoInputRef.current?.click()}
                    disabled={modalCatalogPhotoFiles.length >= 2}
                    className="mt-1 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-green-power-300 text-green-power-700 text-sm font-medium hover:bg-green-power-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" /></svg>
                    {modalCatalogPhotoFiles.length > 0
                      ? t('offer.itemPhotosChosen', { count: modalCatalogPhotoFiles.length })
                      : t('offer.itemPhotosChoose')}
                  </button>
                  {modalCatalogPhotoPreviews.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {modalCatalogPhotoPreviews.map((url, idx) => (
                        <div key={idx} className="relative group">
                          <button
                            type="button"
                            onClick={() => setLightbox({ url, image: null })}
                            className="block w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden ring-1 ring-black/10 shadow-md cursor-zoom-in flex-shrink-0"
                          >
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              URL.revokeObjectURL(url);
                              setModalCatalogPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
                              setModalCatalogPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow hover:bg-red-600"
                            aria-label={t('offer.remove')}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={closeCatalogItemModal}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={addToCartFromCatalog}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold"
                style={{
                  background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 50%, #4d6f57 100%)',
                  boxShadow: '0 4px 14px rgba(93, 138, 106, 0.35)',
                }}
              >
                Add item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen image lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t('common.close')}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 z-10 p-2 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors"
            aria-label={t('common.close')}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightbox.url}
            alt=""
            className="max-w-full max-h-full w-auto h-auto object-contain"
            onPointerDown={startLongPress}
            onPointerMove={moveLongPress}
            onPointerUp={clearLongPress}
            onPointerCancel={clearLongPress}
            onPointerLeave={clearLongPress}
            onClick={(e) => {
              if (suppressNextLightboxClickRef.current) {
                suppressNextLightboxClickRef.current = false;
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              e.stopPropagation();
            }}
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
