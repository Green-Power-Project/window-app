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

export type GalleryCategoryLabelsState = {
  labels: CategoryLabelsMap;
  categoryKeys: string[];
};

/**
 * Subscribe to gallery category keys and labels from Firestore.
 */
export function subscribeGalleryCategoryLabels(
  onUpdate: (state: GalleryCategoryLabelsState) => void
): () => void {
  onUpdate({ labels: {}, categoryKeys: [...GALLERY_CATEGORIES] });

  if (!db) return () => {};

  const ref = doc(db, CONFIG_COLLECTION, GALLERY_DOC_ID);
  const unsubscribe = onSnapshot(
    ref,
    (snap) => {
      const labels: CategoryLabelsMap = {};
      let categoryKeys: string[] = [];
      if (snap.exists()) {
        const data = snap.data();
        const raw = data?.categoryLabels;
        if (typeof raw === 'object' && raw !== null) Object.assign(labels, raw);
        if (Array.isArray(data?.categoryKeys) && data.categoryKeys.length > 0) {
          categoryKeys = data.categoryKeys.filter((k: unknown) => typeof k === 'string');
        }
      }
      if (categoryKeys.length === 0) categoryKeys = [...GALLERY_CATEGORIES];
      onUpdate({ labels, categoryKeys });
    },
    () => onUpdate({ labels: {}, categoryKeys: [...GALLERY_CATEGORIES] })
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
 * React hook: live category keys and labels from Firestore.
 */
export function useGalleryCategoryLabels(): {
  labels: CategoryLabelsMap;
  categoryKeys: string[];
  getDisplayName: (key: string) => string;
} {
  const [state, setState] = useState<GalleryCategoryLabelsState>({
    labels: {},
    categoryKeys: [...GALLERY_CATEGORIES],
  });
  useEffect(() => {
    const unsub = subscribeGalleryCategoryLabels(setState);
    return unsub;
  }, []);

  return {
    labels: state.labels,
    categoryKeys: state.categoryKeys,
    getDisplayName: (key: string) => getCategoryDisplayName(state.labels, key),
  };
}
