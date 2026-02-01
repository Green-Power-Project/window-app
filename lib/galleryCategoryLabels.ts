/**
 * Gallery category labels from Firestore config (same doc admin edits).
 * Enables instant sync: admin edits category name → customer sees updated label.
 */

import { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { GALLERY_CATEGORIES } from './galleryConstants';

const CONFIG_COLLECTION = 'config';
const GALLERY_DOC_ID = 'gallery';

export type CategoryLabelsMap = Record<string, string>;

/**
 * Subscribe to gallery category labels from Firestore. Returns labels map; missing keys use the key as label.
 */
export function subscribeGalleryCategoryLabels(onUpdate: (labels: CategoryLabelsMap) => void): () => void {
  onUpdate({});

  if (!db) return () => {};

  const ref = doc(db, CONFIG_COLLECTION, GALLERY_DOC_ID);
  const unsubscribe = onSnapshot(
    ref,
    (snap) => {
      const labels: CategoryLabelsMap = {};
      if (snap.exists()) {
        const data = snap.data();
        const raw = data?.categoryLabels;
        if (typeof raw === 'object' && raw !== null) {
          Object.assign(labels, raw);
        }
      }
      onUpdate(labels);
    },
    () => onUpdate({})
  );
  return unsubscribe;
}

/**
 * Get display name for a category key (custom label or key).
 */
export function getCategoryDisplayName(labels: CategoryLabelsMap, key: string): string {
  if (labels[key]?.trim()) return labels[key].trim();
  return key;
}

/**
 * React hook: live category labels from Firestore. Category keys = GALLERY_CATEGORIES.
 */
export function useGalleryCategoryLabels(): {
  labels: CategoryLabelsMap;
  categoryKeys: readonly string[];
  getDisplayName: (key: string) => string;
} {
  const [labels, setLabels] = useState<CategoryLabelsMap>({});
  useEffect(() => {
    const unsub = subscribeGalleryCategoryLabels(setLabels);
    return unsub;
  }, []);

  return {
    labels,
    categoryKeys: GALLERY_CATEGORIES,
    getDisplayName: (key: string) => getCategoryDisplayName(labels, key),
  };
}
