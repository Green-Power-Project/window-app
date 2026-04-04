/** Read `fileUrl` / `fileKey` from project file Firestore documents (after migration). */

export function fileUrlFromFirestoreDoc(data: Record<string, unknown>): string {
  const v = data.fileUrl;
  return typeof v === 'string' && v ? v : '';
}

export function fileKeyFromFirestoreDoc(data: Record<string, unknown>): string {
  const v = data.fileKey;
  return typeof v === 'string' && v ? v : '';
}
