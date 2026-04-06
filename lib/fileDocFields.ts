/** Read `fileUrl` / `fileKey` from project file Firestore documents (after migration). */

/**
 * Deployed customer/admin: Firestore may still have `http://localhost:3000/uploads/...` from dev uploads.
 * When `NEXT_PUBLIC_ADMIN_API_BASE_URL` (or panel URL) is a non-localhost https URL, rewrite to that origin
 * so the same path is requested from production (file must exist on VPS at that path).
 * No-op if admin base is localhost (local dev) or fileUrl is already non-localhost.
 */
export function normalizeFileUrlForDeployment(fileUrl: string): string {
  const raw = (fileUrl || '').trim();
  if (!raw) return raw;
  const adminBase = (
    process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_ADMIN_PANEL_URL ||
    ''
  ).trim();
  if (!adminBase) return raw;
  try {
    const adminUrl = new URL(adminBase);
    if (adminUrl.hostname === 'localhost' || adminUrl.hostname === '127.0.0.1') {
      return raw;
    }
    const u = new URL(raw);
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
      return raw;
    }
    return `${adminUrl.origin}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return raw;
  }
}

export function fileUrlFromFirestoreDoc(data: Record<string, unknown>): string {
  const v = data.fileUrl;
  const s = typeof v === 'string' && v ? v : '';
  return normalizeFileUrlForDeployment(s);
}

export function fileKeyFromFirestoreDoc(data: Record<string, unknown>): string {
  const v = data.fileKey;
  return typeof v === 'string' && v ? v : '';
}
