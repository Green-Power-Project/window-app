/**
 * Contact settings for customer portal.
 * Reads from Firestore siteSettings/contact (same doc admin panel edits).
 * Falls back to env (NEXT_PUBLIC_CONTACT_*) when Firestore is empty or unavailable.
 */

import { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const CONTACT_SETTINGS_COLLECTION = 'siteSettings';
const CONTACT_SETTINGS_DOC_ID = 'contact';

export interface ContactSettingsData {
  phone: string;
  email: string;
  whatsApp: string;
  website: string;
}

export interface ContactLinksResolved {
  phone: string;   // tel: URL
  email: string;   // mailto: URL
  whatsApp: string;
  website: string;
}

const DEFAULTS: ContactLinksResolved = {
  phone: 'tel:+491234567890',
  email: 'mailto:info@gruen-power.de',
  whatsApp: 'https://wa.me/491234567890',
  website: 'https://gruen-power.de/',
};

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

function fromEnv(): ContactLinksResolved {
  const phone = process.env.NEXT_PUBLIC_CONTACT_PHONE ?? '';
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? '';
  const whatsApp = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP ?? '';
  const website = process.env.NEXT_PUBLIC_CONTACT_WEBSITE ?? '';
  return {
    phone: telUrl(phone),
    email: mailtoUrl(email),
    whatsApp: whatsAppUrl(whatsApp),
    website: websiteUrl(website),
  };
}

/**
 * Resolve raw contact data to hrefs. Uses env fallback for empty fields.
 */
function resolveLinks(data: ContactSettingsData | null): ContactLinksResolved {
  const env = fromEnv();
  if (!data) return env;
  return {
    phone: (data.phone && data.phone.trim()) ? telUrl(data.phone) : env.phone,
    email: (data.email && data.email.trim()) ? mailtoUrl(data.email) : env.email,
    whatsApp: (data.whatsApp && data.whatsApp.trim()) ? whatsAppUrl(data.whatsApp) : env.whatsApp,
    website: (data.website && data.website.trim()) ? websiteUrl(data.website) : env.website,
  };
}

/**
 * Subscribe to contact settings from Firestore. Returns resolved links (Firestore overrides env).
 * Used by components that need live-updating contact links (e.g. gallery).
 */
export function subscribeContactSettings(
  onUpdate: (links: ContactLinksResolved) => void
): () => void {
  const envFallback = fromEnv();
  onUpdate(envFallback);

  if (!db) return () => {};

  const ref = doc(db, CONTACT_SETTINGS_COLLECTION, CONTACT_SETTINGS_DOC_ID);
  const unsubscribe = onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? (snap.data() as ContactSettingsData) : null;
      onUpdate(resolveLinks(data));
    },
    () => {
      onUpdate(envFallback);
    }
  );
  return unsubscribe;
}

/**
 * React hook: live contact links from Firestore (with env fallback).
 * Use in gallery and any screen that shows contact buttons.
 */
export function useContactSettings(): ContactLinksResolved {
  const [links, setLinks] = useState<ContactLinksResolved>(() => fromEnv());
  useEffect(() => {
    const unsub = subscribeContactSettings(setLinks);
    return unsub;
  }, []);
  return links;
}
