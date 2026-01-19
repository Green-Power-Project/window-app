import { db } from './firebase';
import { collection, query, where, getDocs, addDoc, Timestamp } from 'firebase/firestore';

export interface ReportApproval {
  id?: string;
  projectId: string;
  customerId: string;
  filePath: string; // Full storage path: projects/{projectId}/{folderPath}/{filename}
  approvedAt: Timestamp;
  status: 'approved';
}

export type ReportStatus = 'unread' | 'read' | 'approved';

/**
 * Check if a report has been approved by a customer
 */
export async function isReportApproved(
  projectId: string,
  customerId: string,
  filePath: string
): Promise<boolean> {
  try {
    const q = query(
      collection(db, 'reportApprovals'),
      where('projectId', '==', projectId),
      where('customerId', '==', customerId),
      where('filePath', '==', filePath),
      where('status', '==', 'approved')
    );
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking report approval status:', error);
    return false;
  }
}

/**
 * Approve a report
 */
export async function approveReport(
  projectId: string,
  customerId: string,
  filePath: string
): Promise<void> {
  try {
    // Check if already approved
    const alreadyApproved = await isReportApproved(projectId, customerId, filePath);
    if (alreadyApproved) {
      return; // Already approved
    }

    // Mark as approved
    await addDoc(collection(db, 'reportApprovals'), {
      projectId,
      customerId,
      filePath,
      status: 'approved',
      approvedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error approving report:', error);
    throw error;
  }
}

/**
 * Get report status: unread, read, or approved
 */
export async function getReportStatus(
  projectId: string,
  customerId: string,
  filePath: string,
  isRead: boolean
): Promise<ReportStatus> {
  const approved = await isReportApproved(projectId, customerId, filePath);
  if (approved) {
    return 'approved';
  }
  if (isRead) {
    return 'read';
  }
  return 'unread';
}

/**
 * Check if a file path is a report (in 03_Reports folder)
 */
export function isReportFile(folderPath: string): boolean {
  return folderPath.startsWith('03_Reports');
}

