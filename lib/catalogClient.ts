export interface CatalogFolder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

export interface CatalogEntry {
  id: string;
  folderId: string;
  name: string;
  description: string;
  fileUrl: string;
  fileName: string;
  order: number;
}

/** Fetches catalogue folders from the app API (server reads Firestore via Admin SDK). */
export async function getCatalogFolders(): Promise<CatalogFolder[]> {
  try {
    const res = await fetch('/api/catalog-folders');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching catalog folders:', error);
    return [];
  }
}

/** Fetches catalogue entries (PDFs) for a folder from the app API. */
export async function getCatalogEntries(folderId: string): Promise<CatalogEntry[]> {
  if (!folderId) return [];
  try {
    const res = await fetch(`/api/catalog-entries?folderId=${encodeURIComponent(folderId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data) ? data : [];
    return items.sort((a: CatalogEntry, b: CatalogEntry) => a.order - b.order);
  } catch (error) {
    console.error('Error fetching catalog entries:', error);
    return [];
  }
}

