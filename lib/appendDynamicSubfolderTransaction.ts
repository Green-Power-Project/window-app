/**
 * Single source of truth for extra subfolders: `projects/{projectId}.dynamicSubfolders`
 * (plus optional `folderDisplayNames[path]`). Admin and customer both read the same
 * document; `onSnapshot` updates both panels. This helper appends atomically so
 * concurrent creates from admin + customer never overwrite each other.
 */

import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { mergeDynamicSubfolders, type Folder } from '@/lib/folderStructure';

/**
 * Append one dynamic subfolder segment under `parentPath` if not already present
 * (including fixed + existing dynamic children). No-op if duplicate or invalid.
 * @returns whether a new subfolder was written
 */
export async function appendDynamicSubfolderTransaction(
  db: Firestore,
  projectId: string,
  baseStructure: Folder[],
  parentPath: string,
  segment: string,
  displayLabel: string,
  fullPath: string
): Promise<boolean> {
  const ref = doc(db, 'projects', projectId);
  let wrote = false;
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      throw new Error('Project not found');
    }
    const data = snap.data() as {
      dynamicSubfolders?: Record<string, string[]>;
      folderDisplayNames?: Record<string, string>;
    };
    const merged = mergeDynamicSubfolders(baseStructure, data.dynamicSubfolders);
    const parentFolder = merged.find((f) => f.path === parentPath);
    if (!parentFolder?.children?.length) {
      return;
    }
    const existing = new Set(parentFolder.children.map((c) => c.path));
    if (existing.has(fullPath)) {
      return;
    }
    const prev = data.dynamicSubfolders?.[parentPath] ?? [];
    if (prev.includes(segment)) {
      return;
    }
    const nextList = [...prev, segment].sort((a, b) => a.localeCompare(b));
    const nextDynamic = { ...(data.dynamicSubfolders ?? {}), [parentPath]: nextList };
    const nextNames = { ...(data.folderDisplayNames ?? {}), [fullPath]: displayLabel.trim() };
    transaction.update(ref, {
      dynamicSubfolders: nextDynamic,
      folderDisplayNames: nextNames,
    });
    wrote = true;
  });
  return wrote;
}
