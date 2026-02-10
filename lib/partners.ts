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
];
