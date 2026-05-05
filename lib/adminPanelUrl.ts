/**
 * Admin panel base URL for notification API calls from the customer app.
 * Set NEXT_PUBLIC_ADMIN_API_BASE_URL in .env.local / deployment (production: https://admin.gruen-power.cloud).
 * No trailing slash.
 */
export function getAdminPanelBaseUrl(): string {
  const url = (process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL || '').trim();
  const normalized = url.replace(/\/$/, '');
  if (!normalized) return normalized;
  try {
    const target = new URL(normalized);
    if (
      typeof window !== 'undefined' &&
      (target.hostname === 'localhost' || target.hostname === '127.0.0.1') &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      // On real devices, localhost admin API is unreachable; skip notification calls.
      return '';
    }
  } catch {
    // Keep previous behavior for invalid URL values.
  }
  return normalized;
}

/**
 * Firestore may store absolute admin URLs for VPS files (`https://admin…/uploads/…`).
 * Load them on the customer origin as `/uploads/…` so `next.config` rewrites → `uploads-proxy`
 * (avoids blank PDF iframes and pdf.js CORS from cross-origin admin).
 */
export function toCustomerPortalMediaUrl(fileUrl: string): string {
  const trimmed = (fileUrl || '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  const adminBase = getAdminPanelBaseUrl();
  if (!adminBase) return trimmed;
  try {
    const adminOrigin = new URL(adminBase).origin;
    const u = new URL(trimmed);
    if (u.origin !== adminOrigin) return trimmed;
    if (!u.pathname.startsWith('/uploads')) return trimmed;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return trimmed;
  }
}
