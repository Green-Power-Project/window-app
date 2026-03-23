/**
 * Aggregate unread file counts per top-level folder (customer: fileReadStatus).
 * Mirrors ProjectFolderTree logic for use on dashboard / sidebar without mounting the tree.
 */

import { db } from '@/lib/firebase';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import {
  PROJECT_FOLDER_STRUCTURE,
  CUSTOM_FOLDER_PREFIX,
  mergeDynamicSubfolders,
  type Folder,
} from '@/lib/folderStructure';

const UNREAD_COUNT_QUERY_LIMIT = 300;

function getFolderSegments(folderPath: string): string[] {
  return folderPath.split('/').filter(Boolean);
}

function getProjectFolderRef(projectId: string, folderSegments: string[]) {
  if (folderSegments.length === 0) {
    throw new Error('Folder segments must not be empty');
  }
  if (!db) {
    throw new Error('Firestore database is not initialized');
  }
  const folderPathId = folderSegments.join('__');
  return collection(db, 'files', 'projects', projectId, folderPathId, 'files');
}

function buildFoldersWithCustom(
  customFolders: string[],
  dynamicSubfolders?: Record<string, string[]>
): Folder[] {
  const base = mergeDynamicSubfolders(PROJECT_FOLDER_STRUCTURE, dynamicSubfolders);
  if (!customFolders.length) return base;
  const customChildren: Folder[] = customFolders.map((path) => ({
    name: path.split('/').pop()?.replace(/_/g, ' ') || path,
    path,
  }));
  return [...base, { name: CUSTOM_FOLDER_PREFIX, path: CUSTOM_FOLDER_PREFIX, children: customChildren }];
}

/**
 * Returns map: top-level folder path -> aggregated unread count (all nested files).
 */
export async function computeCustomerFolderUnreadByParent(
  projectId: string,
  customerId: string,
  customFolders: string[] = [],
  dynamicSubfolders?: Record<string, string[]>
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!db) return counts;

  const readFilesQuery = query(
    collection(db, 'fileReadStatus'),
    where('projectId', '==', projectId),
    where('customerId', '==', customerId)
  );
  const readFilesSnapshot = await getDocs(readFilesQuery);
  const readFilePaths = new Set<string>();
  readFilesSnapshot.forEach((doc) => {
    readFilePaths.add(doc.data().filePath as string);
  });

  const folders = buildFoldersWithCustom(customFolders, dynamicSubfolders);
  const allSubfolders: Array<{ path: string; isCustomerUploads: boolean; parentPath: string }> = [];

  for (const folder of folders) {
    if (!folder.children) continue;
    const isCustomerUploads = folder.path.startsWith('01_Customer_Uploads');
    for (const child of folder.children) {
      allSubfolders.push({ path: child.path, isCustomerUploads, parentPath: folder.path });
      if (child.children) {
        for (const grand of child.children) {
          allSubfolders.push({ path: grand.path, isCustomerUploads, parentPath: folder.path });
        }
      }
    }
  }

  const countUnreadInFolder = async (folderPath: string, isCustomerUploads: boolean): Promise<number> => {
    try {
      const segments = getFolderSegments(folderPath);
      if (segments.length === 0) return 0;
      const filesCollection = getProjectFolderRef(projectId, segments);
      const filesQuery = isCustomerUploads
        ? query(filesCollection, where('uploadedBy', '==', customerId), limit(UNREAD_COUNT_QUERY_LIMIT))
        : query(filesCollection, limit(UNREAD_COUNT_QUERY_LIMIT));
      const snapshot = await getDocs(filesQuery);
      let unreadCount = 0;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const filePath = data.cloudinaryPublicId as string;
        if (!readFilePaths.has(filePath)) unreadCount++;
      });
      return unreadCount;
    } catch {
      return 0;
    }
  };

  const results = await Promise.all(
    allSubfolders.map((sf) =>
      countUnreadInFolder(sf.path, sf.isCustomerUploads).then((count) => ({
        parentPath: sf.parentPath,
        count,
      }))
    )
  );

  for (const { parentPath, count } of results) {
    counts.set(parentPath, (counts.get(parentPath) || 0) + count);
  }

  return counts;
}

/** Sum of all folder unread for the project (customer). */
export async function computeCustomerTotalFolderUnread(
  projectId: string,
  customerId: string,
  customFolders: string[] = [],
  dynamicSubfolders?: Record<string, string[]>
): Promise<number> {
  const map = await computeCustomerFolderUnreadByParent(projectId, customerId, customFolders, dynamicSubfolders);
  let total = 0;
  map.forEach((n) => {
    total += n;
  });
  return total;
}
