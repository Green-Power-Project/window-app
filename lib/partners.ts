/**
 * Partner companies shown in the sliding strip on the login screen.
 * Add logoSrc (path in public/, e.g. /partners/partner1.png) and/or name.
 * If logoSrc is set, the logo is shown; otherwise the name is shown as text.
 */
export interface Partner {
  name: string;
  logoSrc?: string;
  url?: string;
}

export const LOGIN_PARTNERS: Partner[] = [
  { name: 'Partner 1', logoSrc: '/partners/partner1.png' },
  { name: 'Partner 2', logoSrc: '/partners/partner2.png' },
  { name: 'Partner 3', logoSrc: '/partners/partner3.png' },
  { name: 'Partner 4', logoSrc: '/partners/partner4.svg' },
  { name: 'Partner 5', logoSrc: '/partners/partner5.png' },
  { name: 'Partner 6', logoSrc: '/partners/partner6.png' },
  { name: 'Partner 7', logoSrc: '/partners/partner7.png' },
  { name: 'Partner 8', logoSrc: '/partners/partner8.avif'},
];
