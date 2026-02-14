import { collection, getDocs, orderBy, query, where, Firestore } from 'firebase/firestore';

export interface OfferFolder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

export interface OfferCatalogItem {
  id: string;
  folderId: string;
  name: string;
  description: string;
  unit: string;
  price: string;
  quantityUnit: string;
  imageUrl: string | null;
  order: number;
}

/**
 * Fetch all offer folders for the customer panel.
 * Requires Firestore rules to allow read on 'offerFolders'.
 */
export async function getOfferFolders(
  db: Firestore | null | undefined
): Promise<OfferFolder[]> {
  if (!db) return [];
  try {
    const snapshot = await getDocs(
      query(collection(db, 'offerFolders'), orderBy('order'))
    );
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name ?? '',
        parentId: data.parentId ?? null,
        order: typeof data.order === 'number' ? data.order : 0,
      };
    });
  } catch (error) {
    console.error('Error fetching offer folders:', error);
    return [];
  }
}

/**
 * Fetch offer items in a folder.
 * Requires Firestore rules to allow read on 'offerItems'.
 * Sorted by order in memory to avoid requiring a composite index.
 */
export async function getOfferItems(
  db: Firestore | null | undefined,
  folderId: string
): Promise<OfferCatalogItem[]> {
  if (!db || !folderId) return [];
  try {
    const snapshot = await getDocs(
      query(
        collection(db, 'offerItems'),
        where('folderId', '==', folderId)
      )
    );
    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        folderId: data.folderId ?? '',
        name: data.name ?? '',
        description: typeof data.description === 'string' ? data.description : '',
        unit: typeof data.unit === 'string' ? data.unit : '',
        price: typeof data.price === 'string' ? data.price : '',
        quantityUnit: typeof data.quantityUnit === 'string' ? data.quantityUnit : '',
        imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : null,
        order: typeof data.order === 'number' ? data.order : 0,
      };
    });
    return items.sort((a, b) => a.order - b.order);
  } catch (error) {
    console.error('Error fetching offer items:', error);
    return [];
  }
}
