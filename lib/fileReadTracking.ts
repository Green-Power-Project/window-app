import { db } from './firebase';
import { collection, query, where, getDocs, addDoc, Timestamp } from 'firebase/firestore';

export interface FileReadStatus {
  id?: string;
  projectId: string;
  customerId: string;
  filePath: string; // Full path in storage: projects/{projectId}/{folderPath}/{filename}
  readAt: Timestamp;
}

/**
 * Check if a file has been read by a customer
 */
export async function isFileRead(
  projectId: string,
  customerId: string,
  filePath: string
): Promise<boolean> {
  try {
    const q = query(
      collection(db, 'fileReadStatus'),
      where('projectId', '==', projectId),
      where('customerId', '==', customerId),
      where('filePath', '==', filePath)
    );
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking file read status:', error);
    return false;
  }
}

/**
 * Mark a file as read by a customer
 */
export async function markFileAsRead(
  projectId: string,
  customerId: string,
  filePath: string
): Promise<void> {
  try {
    // Check if already marked as read
    const alreadyRead = await isFileRead(projectId, customerId, filePath);
    if (alreadyRead) {
      return; // Already marked as read
    }

    // Mark as read
    await addDoc(collection(db, 'fileReadStatus'), {
      projectId,
      customerId,
      filePath,
      readAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error marking file as read:', error);
    throw error;
  }
}

/**
 * Get all unread files for a customer in a project
 * Returns a map of file paths to their folder paths
 */
export async function getUnreadFiles(
  projectId: string,
  customerId: string
): Promise<Map<string, string>> {
  // This will be used to filter files - we'll get all files and check read status
  // For efficiency, we could cache this, but for now we'll check on-demand
  return new Map();
}

