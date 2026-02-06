/**
 * Admin panel base URL for notification API calls from the customer app.
 * Set NEXT_PUBLIC_ADMIN_API_BASE_URL in .env.local / Vercel to your admin URL (e.g. https://admin.yourdomain.com).
 * No trailing slash.
 */
export function getAdminPanelBaseUrl(): string {
  const url = (process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL || '').trim();
  return url.replace(/\/$/, '');
}
