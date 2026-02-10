'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { LOGIN_PARTNERS, type Partner } from '@/lib/partners';

function PartnerItem({ partner }: { partner: Partner }) {
  const Wrapper = partner.url ? 'a' : 'div';
  const wrapperProps = partner.url
    ? { href: partner.url, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className="flex flex-shrink-0 items-center justify-center rounded-2xl px-6 py-3 min-h-[72px] bg-black border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200"
    >
      {partner.logoSrc ? (
        <img
          src={partner.logoSrc}
          alt={partner.name}
          className="h-10 sm:h-12 w-auto max-w-[140px] object-contain object-center"
          loading="lazy"
        />
      ) : (
        <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{partner.name}</span>
      )}
    </Wrapper>
  );
}

export default function PartnersSlider() {
  const { t } = useLanguage();
  if (LOGIN_PARTNERS.length === 0) return null;

  // Repeat list several times so the horizontal scroll feels continuous.
  const repeated: Partner[] = [
    ...LOGIN_PARTNERS,
    ...LOGIN_PARTNERS,
    ...LOGIN_PARTNERS,
    ...LOGIN_PARTNERS,
  ];

  return (
    <div
      className="w-full max-w-4xl min-w-0 flex-shrink-0 overflow-hidden rounded-2xl border border-white/80 px-4 py-4 sm:px-5 sm:py-5 bg-white/80"
      aria-label="Partner companies"
    >
      <p className="text-center text-xs font-semibold uppercase tracking-wider text-gray-600 mb-3 sm:mb-4">
        {t('login.partnersHeading')}
      </p>
      <div className="relative overflow-hidden">
        <div className="flex w-max flex-nowrap gap-4 animate-partners-marquee">
          {repeated.map((partner, index) => (
            <PartnerItem key={`${partner.name}-${index}`} partner={partner} />
          ))}
        </div>
      </div>
    </div>
  );
}

