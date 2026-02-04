import { collection, getDocs, Firestore } from 'firebase/firestore';

export interface GalleryImage {
  id: string;
  url: string;
  category: string;
  title: string;
}

const GALLERY_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const galleryCache: { key: string; data: GalleryImage[]; ts: number }[] = [];

function getGalleryCacheKey(projectId?: string | null): string {
  return projectId ?? 'all';
}

function getCachedGallery(key: string): GalleryImage[] | null {
  const entry = galleryCache.find((e) => e.key === key);
  if (!entry || Date.now() - entry.ts > GALLERY_CACHE_TTL_MS) return null;
  return entry.data;
}

function setCachedGallery(key: string, data: GalleryImage[]) {
  const idx = galleryCache.findIndex((e) => e.key === key);
  if (idx >= 0) galleryCache.splice(idx, 1);
  galleryCache.push({ key, data: [...data], ts: Date.now() });
  if (galleryCache.length > 10) galleryCache.shift();
}

/**
 * Fetch gallery images from Firestore using the client SDK.
 * Does not require user login — works as long as Firestore rules allow read on `gallery`.
 * Results are cached for 2 minutes by projectId (or 'all' when no projectId).
 * @param db Firestore instance (from @/lib/firebase). Can be null; returns [] then.
 * @param projectId If set, only return images whose projectIds array contains this id.
 */
export async function getGalleryImages(
  db: Firestore | null | undefined,
  projectId?: string | null
): Promise<GalleryImage[]> {
  if (!db) return [];
  const cacheKey = getGalleryCacheKey(projectId);
  const cached = getCachedGallery(cacheKey);
  if (cached) return cached;
  try {
    const snapshot = await getDocs(collection(db, 'gallery'));
    const images = snapshot.docs
      .filter((doc) => {
        const data = doc.data();
        if (data.isActive === false) return false;
        if (projectId) {
          const ids = data.projectIds;
          if (!Array.isArray(ids) || !ids.includes(projectId)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aTime = a.data().uploadedAt?.toMillis?.() ?? a.data().uploadedAt?.seconds ?? 0;
        const bTime = b.data().uploadedAt?.toMillis?.() ?? b.data().uploadedAt?.seconds ?? 0;
        return bTime - aTime;
      })
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          url: data.url ?? '',
          category: data.category ?? '',
          title: data.title ?? '',
        };
      });
    setCachedGallery(cacheKey, images);
    return images;
  } catch (error) {
    console.error('Error fetching gallery images from Firestore:', error);
    return [];
  }
}
