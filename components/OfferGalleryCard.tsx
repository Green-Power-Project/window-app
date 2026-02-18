'use client';

import React from 'react';
import { GalleryImage } from '@/lib/galleryClient';

type OfferGalleryCardProps = {
  img: GalleryImage;
  /** Called when the main button (Request a quote) is clicked */
  onRequestQuote: (img: GalleryImage) => void;
  /** Called when the image thumbnail is clicked (opens lightbox) */
  onImageClick?: (img: GalleryImage) => void;
  /** Optional extra wrapper classes to match slightly different containers */
  variant?: 'default' | 'overlay';
  /** Title to display (already resolved, typically category display name) */
  title: string;
  /** Price text to show (already formatted, e.g. "€ 20") */
  priceText?: string;
  /** Label for the primary button (localized in caller) */
  buttonLabel: string;
};

export default function OfferGalleryCard({
  img,
  onRequestQuote,
  onImageClick,
  variant = 'default',
  title,
  priceText,
  buttonLabel,
}: OfferGalleryCardProps) {
  const wrapperCommon =
    'group/card flex flex-col rounded-xl overflow-hidden transition-all duration-300 focus-within:ring-2 focus-within:ring-green-power-500 focus-within:ring-offset-2';

  const wrapperClass =
    variant === 'overlay'
      ? `${wrapperCommon} bg-white/90 backdrop-blur-sm border border-white/50 shadow-md`
      : `${wrapperCommon} bg-white border border-gray-100`;

  const wrapperStyle =
    variant === 'overlay'
      ? undefined
      : {
          boxShadow: '0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        } as React.CSSProperties;

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onImageClick?.(img);
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
        <h3 className="text-xs font-bold text-gray-900 line-clamp-2 leading-tight mb-2">{title}</h3>
        {priceText && (
          <p className="text-xs font-semibold text-red-600 mb-2">{priceText}</p>
        )}
        <button
          type="button"
          onClick={() => onRequestQuote(img)}
          className="mt-auto w-full inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold text-white transition-all duration-200 hover:shadow-md active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
            boxShadow: '0 2px 6px rgba(93, 138, 106, 0.3)',
          }}
        >
          {buttonLabel}
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

