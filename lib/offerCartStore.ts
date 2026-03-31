/**
 * Minimal serializable shape of a cart item used for persistence.
 * This intentionally excludes File objects and other non-JSON data.
 */
export interface StoredCartItem {
  itemType?: 'gallery' | 'folder' | 'catalogue';
  imageId?: string;
  offerItemId?: string;
  imageUrl?: string;
  itemName?: string;
  color?: string;
  quantityMeters?: string;
  quantityPieces?: string;
  quantityUnit?: string;
  dimension?: string;
  note?: string;
  price?: string;
  photoUrls?: string[];
}

const KEY = '__offerCart';
const ANON_STORAGE_KEY = '__offerCart_snapshot_anon_v1';
const USER_STORAGE_PREFIX = '__offerCart_user_';

declare global {
  interface Window {
    [KEY]?: StoredCartItem[];
  }
}

export function setOfferCart(items: StoredCartItem[], userId?: string | null): void {
  if (typeof window === 'undefined') return;
  // In-memory (keeps File objects in the original cart on the page that set it).
  window[KEY] = items;

  // Serializable snapshot:
  // - Anonymous users: sessionStorage (clears when tab is closed)
  // - Logged-in users: localStorage (persists until explicit logout)
  try {
    const snapshot: StoredCartItem[] = items.map((item) => {
      const photoUrls = (item as StoredCartItem).photoUrls;
      const plain: StoredCartItem = {
        itemType: (item as StoredCartItem).itemType,
        imageId: (item as StoredCartItem).imageId,
        offerItemId: (item as StoredCartItem).offerItemId,
        imageUrl: (item as StoredCartItem).imageUrl,
        itemName: (item as StoredCartItem).itemName,
        color: (item as StoredCartItem).color,
        quantityMeters: (item as StoredCartItem).quantityMeters,
        quantityPieces: (item as StoredCartItem).quantityPieces,
        quantityUnit: (item as StoredCartItem).quantityUnit,
        dimension: (item as StoredCartItem).dimension,
        note: (item as StoredCartItem).note,
        price: (item as StoredCartItem).price,
        photoUrls: Array.isArray(photoUrls)
          ? photoUrls
              .filter((v): v is string => typeof v === 'string')
              .map((v) => v.trim())
              .filter((v) => v.length > 0)
          : undefined,
      };
      return plain;
    });

    if (userId && typeof window.localStorage !== 'undefined') {
      const key = `${USER_STORAGE_PREFIX}${userId}`;
      window.localStorage.setItem(key, JSON.stringify(snapshot));
    } else if (typeof window.sessionStorage !== 'undefined') {
      window.sessionStorage.setItem(ANON_STORAGE_KEY, JSON.stringify(snapshot));
    }
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
}

export function getOfferCart(userId?: string | null): StoredCartItem[] | null {
  if (typeof window === 'undefined') return null;
  if (window[KEY]) return window[KEY] ?? null;

  try {
    let raw: string | null = null;
    if (userId && typeof window.localStorage !== 'undefined') {
      const key = `${USER_STORAGE_PREFIX}${userId}`;
      raw = window.localStorage.getItem(key);
    } else if (typeof window.sessionStorage !== 'undefined') {
      raw = window.sessionStorage.getItem(ANON_STORAGE_KEY);
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as StoredCartItem[];
  } catch {
    return null;
  }
}


