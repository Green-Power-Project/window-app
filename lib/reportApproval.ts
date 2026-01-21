import { db } from './firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';

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

    // Find existing pending document and update it, or create new one if not found
    const q = query(
      collection(db, 'reportApprovals'),
      where('projectId', '==', projectId),
      where('customerId', '==', customerId),
      where('filePath', '==', filePath)
    );
    const querySnapshot = await getDocs(q);
    
    console.log('Searching for approval document:', { projectId, customerId, filePath, found: querySnapshot.size });
    
    if (!querySnapshot.empty) {
      // Update existing document (should be pending)
      const docRef = querySnapshot.docs[0].ref;
      const existingData = querySnapshot.docs[0].data();
      
      console.log('Found existing approval document:', { id: docRef.id, currentStatus: existingData.status });
      
      // Use updateDoc for explicit update (more reliable than setDoc with merge)
      await updateDoc(docRef, {
        status: 'approved',
        approvedAt: Timestamp.now(),
        // Preserve uploadedAt and autoApproveDate if they exist
        ...(existingData.uploadedAt && { uploadedAt: existingData.uploadedAt }),
        ...(existingData.autoApproveDate && { autoApproveDate: existingData.autoApproveDate }),
      });
      
      console.log('Successfully updated report approval to approved status');
    } else {
      // Try to find by partial match (in case filePath format differs)
      // Sometimes Cloudinary public_id might have different format
      const allApprovalsQuery = query(
        collection(db, 'reportApprovals'),
        where('projectId', '==', projectId),
        where('customerId', '==', customerId)
      );
      const allSnapshot = await getDocs(allApprovalsQuery);
      
      // Find by matching the end of filePath (filename part)
      const fileName = filePath.split('/').pop() || filePath;
      const matchingDoc = allSnapshot.docs.find(doc => {
        const docFilePath = doc.data().filePath;
        return docFilePath === filePath || docFilePath.endsWith(fileName) || filePath.endsWith(fileName);
      });
      
      if (matchingDoc) {
        console.log('Found approval document by filename match:', { id: matchingDoc.id, filePath: matchingDoc.data().filePath, searchingFor: filePath });
        const docRef = matchingDoc.ref;
        const existingData = matchingDoc.data();
        
        await updateDoc(docRef, {
          status: 'approved',
          approvedAt: Timestamp.now(),
          filePath: filePath, // Update filePath to match what customer app uses
          ...(existingData.uploadedAt && { uploadedAt: existingData.uploadedAt }),
          ...(existingData.autoApproveDate && { autoApproveDate: existingData.autoApproveDate }),
        });
        
        console.log('Successfully updated report approval (found by filename match)');
      } else {
        // Create new document if none exists (fallback)
        console.log('No existing approval document found, creating new one');
        await addDoc(collection(db, 'reportApprovals'), {
          projectId,
          customerId,
          filePath,
          status: 'approved',
          approvedAt: Timestamp.now(),
        });
      }
    }
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

