/**
 * Contact links for customer panel (gallery, footer, etc.).
 * Values come from env (see .env.local) with fallbacks.
 *
 * Env vars in window-app/.env.local (all optional):
 *   NEXT_PUBLIC_CONTACT_PHONE   – e.g. +4915731709686 (tel: is added automatically)
 *   NEXT_PUBLIC_CONTACT_EMAIL   – e.g. info@gruen-power.de (mailto: is added automatically)
 *   NEXT_PUBLIC_CONTACT_WHATSAPP – e.g. 4915731709686 (no + or spaces) or full https://wa.me/...
 *   NEXT_PUBLIC_CONTACT_WEBSITE  – e.g. https://gruen-power.de/
 */

const DEFAULTS = {
  phone: 'tel:+491234567890',
  email: 'mailto:info@gruen-power.de',
  whatsApp: 'https://wa.me/491234567890',
  website: 'https://gruen-power.de/',
} as const;

function telUrl(phone: string): string {
  if (!phone || !phone.trim()) return DEFAULTS.phone;
  const n = phone.trim().replace(/\s/g, '');
  if (n.startsWith('tel:')) return n;
  return `tel:${n}`;
}

function mailtoUrl(email: string): string {
  if (!email || !email.trim()) return DEFAULTS.email;
  const e = email.trim();
  if (e.startsWith('mailto:')) return e;
  return `mailto:${e}`;
}

function whatsAppUrl(value: string): string {
  if (!value || !value.trim()) return DEFAULTS.whatsApp;
  const v = value.trim();
  if (v.startsWith('http')) return v;
  const num = v.replace(/\D/g, '');
  if (!num) return DEFAULTS.whatsApp;
  return `https://wa.me/${num}`;
}

function websiteUrl(url: string): string {
  if (!url || !url.trim()) return DEFAULTS.website;
  const u = url.trim();
  return u.startsWith('http') ? u : `https://${u}`;
}

export const CONTACT_LINKS = {
  phone: telUrl(process.env.NEXT_PUBLIC_CONTACT_PHONE ?? ''),
  email: mailtoUrl(process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? ''),
  whatsApp: whatsAppUrl(process.env.NEXT_PUBLIC_CONTACT_WHATSAPP ?? ''),
  website: websiteUrl(process.env.NEXT_PUBLIC_CONTACT_WEBSITE ?? ''),
};
