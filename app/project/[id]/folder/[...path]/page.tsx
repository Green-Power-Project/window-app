'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import CustomerLayout from '@/components/CustomerLayout';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateFolderPath, translateStatus, getProjectFolderDisplayName } from '@/lib/translations';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  deleteDoc,
  addDoc,
  updateDoc,
  CollectionReference,
  DocumentReference,
} from 'firebase/firestore';
import { PROJECT_FOLDER_STRUCTURE, formatFolderName, isAdminOnlyFolderPath } from '@/lib/folderStructure';
import { markFileAsRead, isFileRead } from '@/lib/fileReadTracking';
import { getReportStatus, approveReport, ReportStatus } from '@/lib/reportApproval';
import FileUploadPreviewModal from '@/components/FileUploadPreviewModal';

const CLOUDINARY_ENDPOINT = '/api/cloudinary';

function ImagePreviewThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return <div className="w-24 h-24 rounded-lg border border-gray-200 bg-gray-100 animate-pulse" />;
  return (
    <div className="w-24 h-24 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
      <img src={url} alt="" className="w-full h-full object-cover" />
    </div>
  );
}

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
  // Firestore requires odd number of segments for collections
  // Since folder paths can be nested (e.g., "01_Customer_Uploads/Photos"), we need to treat
  // the full path as a single document ID to maintain valid collection references
  // Structure: files(collection) -> projects(doc) -> projectId(collection) -> folderPath(doc) -> files(collection)
  // Use the full folder path as a single document ID (replace / with __ to avoid path separator issues)
  const folderPathId = folderSegments.join('__');
  
  // This creates: files(collection) -> projects(doc) -> projectId(collection) -> folderPathId(doc) -> files(collection)
  // = 5 segments (odd) ✓
  return collection(db, 'files', 'projects', projectId, folderPathId, 'files');
}

function deriveFileType(fileName: string): 'pdf' | 'image' | 'file' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) return 'image';
  return 'file';
}

async function uploadCloudinaryFile(file: File, folderPath: string, publicId?: string) {
  const formData = new FormData();
  formData.append('file', file);
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (preset) {
    formData.append('upload_preset', preset);
  }
  
  // If publicId is provided, use it as the full path (don't use folder)
  // If not, use folder to set the path
  if (publicId) {
    formData.append('public_id', publicId);
  } else {
    formData.append('folder', folderPath);
  }

  const response = await fetch(`${CLOUDINARY_ENDPOINT}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Upload failed');
  }

  return await response.json();
}

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
  folderDisplayNames?: Record<string, string>;
}

interface FileItem {
  fileName: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  folderPath: string;
  fileType: string;
  uploadedAt: Date | null;
  reportStatus?: ReportStatus;
  isRead?: boolean; // Read status for all files
  docId?: string; // Firestore document ID
}

async function mapDocToFileItem(docSnap: any, folderPath: string, projectId?: string, customerId?: string): Promise<FileItem> {
  const data = docSnap.data();
  const fileName = data.fileName as string;
  const cloudinaryPublicId = data.cloudinaryPublicId as string;
  const fileType = deriveFileType(fileName);
  
  const fileItem: FileItem = {
    fileName,
    cloudinaryUrl: data.cloudinaryUrl,
    cloudinaryPublicId,
    folderPath,
    fileType,
    uploadedAt: data.uploadedAt?.toDate ? data.uploadedAt.toDate() : null,
    docId: docSnap.id, // Store Firestore document ID
  };

  // Check read status for ALL files
  if (projectId && customerId) {
    try {
      fileItem.isRead = await isFileRead(projectId, customerId, cloudinaryPublicId);
    } catch (error) {
      console.warn('Error checking file read status, defaulting to unread:', error);
      fileItem.isRead = false;
    }
  } else {
    fileItem.isRead = false;
  }

  // Load approval status for all files (for approval status)
  if (projectId && customerId) {
    try {
      fileItem.reportStatus = await getReportStatus(projectId, customerId, cloudinaryPublicId, fileItem.isRead);
    } catch (error) {
      console.warn('Error loading approval status, defaulting to unread:', error);
      fileItem.reportStatus = 'unread';
    }
  } else {
    console.warn('Missing projectId or customerId for file, defaulting to unread:', {
      fileName,
      folderPath,
      hasProjectId: !!projectId,
      hasCustomerId: !!customerId,
    });
    fileItem.reportStatus = 'unread';
  }

  return fileItem;
}

function FolderViewContent() {
  const { t } = useLanguage();
  const params = useParams();
  const { currentUser } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [markingAsRead, setMarkingAsRead] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [customerMessage, setCustomerMessage] = useState('');
  const [submittingMessage, setSubmittingMessage] = useState(false);
  const [customerMessagesList, setCustomerMessagesList] = useState<Array<{ id: string; message: string; createdAt: Date | null; status: string; updatedAt?: Date | null }>>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageValue, setEditingMessageValue] = useState('');
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<{ id: string; message: string } | null>(null);
  const [showMessageForm, setShowMessageForm] = useState(false);
  const [filesCurrentPage, setFilesCurrentPage] = useState(1);
  const [filesItemsPerPage, setFilesItemsPerPage] = useState(10);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageFormRef = useRef<HTMLDivElement | null>(null);
  const currentFolderRef = useRef<string>('');
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projectId = params.id as string;
  const folderPath = Array.isArray(params.path) 
    ? params.path.join('/') 
    : (params.path ? String(params.path) : '');

  const canUpload = folderPath.startsWith('01_Customer_Uploads');
  const isReportFolder = folderPath.startsWith('03_Reports');
  const isAdminOnlyFolder = isAdminOnlyFolderPath(folderPath);

  // Build breadcrumbs
  const folderName = folderPath.split('/').pop() || folderPath;

  // Auto-hide messages after 3 seconds
  useEffect(() => {
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    
    if (uploadSuccess || uploadError) {
      messageTimeoutRef.current = setTimeout(() => {
        setUploadSuccess('');
        setUploadError('');
      }, 3000);
    }
    
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, [uploadSuccess, uploadError]);

  useEffect(() => {
    if (!currentUser || !projectId || !db) return;

    // Always show loading when folder changes (navigation to subfolder)
    setLoading(true);
    setError('');

    // Real-time listener for project document
    const projectUnsubscribe = onSnapshot(
      doc(db, 'projects', projectId),
      (projectDoc) => {
        if (!projectDoc.exists()) {
          setError(t('messages.error.notFound'));
          setLoading(false);
          return;
        }

        const projectData = { id: projectDoc.id, ...projectDoc.data() } as Project;

        if (projectData.customerId !== currentUser.uid) {
          setError(t('messages.error.permission'));
          setLoading(false);
          return;
        }

        setProject(projectData);
        setError('');
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to project:', error);
        setError(t('messages.error.generic'));
        setLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => {
      projectUnsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, projectId]);

  // Load unread files function - defined early so it can be used in useEffect hooks
  const loadUnreadFiles = useCallback(async () => {
    if (!project || !currentUser || !db) return;
    try {
      const readFilesQuery = query(
        collection(db, 'fileReadStatus'),
        where('projectId', '==', projectId),
        where('customerId', '==', currentUser.uid)
      );
      const readFilesSnapshot = await getDocs(readFilesQuery);
      const readFilePaths = new Set<string>();
      readFilesSnapshot.forEach((doc) => {
        readFilePaths.add(doc.data().filePath);
      });

      const folderPaths = PROJECT_FOLDER_STRUCTURE.reduce<string[]>((acc, folder) => {
          acc.push(folder.path);
          folder.children?.forEach((child) => acc.push(child.path));
        return acc;
      }, []);

      const allFilesPromises: Promise<FileItem>[] = [];

      for (const folderPathValue of folderPaths) {
        const segments = getFolderSegments(folderPathValue);
        if (segments.length === 0) continue;
        const filesCollection = getProjectFolderRef(projectId, segments);
        const filesQuery = query(filesCollection, orderBy('uploadedAt', 'desc'));
        const snapshot = await getDocs(filesQuery);

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const storagePath = data.cloudinaryPublicId as string;
          if (readFilePaths.has(storagePath)) return;

          allFilesPromises.push(
            mapDocToFileItem(docSnap, folderPathValue, projectId, currentUser.uid)
          );
        });
      }

      const allFiles = await Promise.all(allFilesPromises);

      setFiles(allFiles);
    } catch (error) {
      console.error('Error loading unread files:', error);
      setError(t('messages.error.failedToLoadUnreadFiles'));
    } finally {
      setLoading(false);
    }
  }, [project, currentUser, projectId, t]);

  useEffect(() => {
    if (!project || !currentUser) return;
    if (!folderPath) {
      setFiles([]);
      return;
    }

    if (isAdminOnlyFolder) {
      setFiles([]);
      setError(t('messages.error.notFound'));
      setLoading(false);
      return;
    }

    const segments = getFolderSegments(folderPath);
    if (segments.length === 0) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const filesCollection = getProjectFolderRef(projectId, segments);
    
    // If this is a customer uploads folder, filter by uploadedBy to show only current customer's files
    const isCustomerUploadsFolder = folderPath.startsWith('01_Customer_Uploads');
    let filesQuery;
    
    if (isCustomerUploadsFolder) {
      // Filter to show only files uploaded by the current customer
      // Note: If orderBy fails due to missing index, we'll catch it and use a simpler query
      try {
        filesQuery = query(
          filesCollection,
          where('uploadedBy', '==', currentUser.uid),
          orderBy('uploadedAt', 'desc')
        );
      } catch (indexError) {
        // Fallback: query without orderBy if index doesn't exist
        console.warn('Index missing for orderBy, using simple query:', indexError);
        filesQuery = query(
          filesCollection,
          where('uploadedBy', '==', currentUser.uid)
        );
      }
    } else {
      filesQuery = query(filesCollection, orderBy('uploadedAt', 'desc'));
    }

    const unsubscribe = onSnapshot(
      filesQuery,
      async (snapshot) => {
        const list = await Promise.all(
          snapshot.docs.map((docSnap) => mapDocToFileItem(docSnap, folderPath, projectId, currentUser.uid))
        );
        // Sort manually if orderBy wasn't used
        if (isCustomerUploadsFolder && list.length > 0 && !list[0].uploadedAt) {
          // If no uploadedAt, files might be from old structure - just show them
        } else {
          list.sort((a, b) => {
            const timeA = a.uploadedAt?.getTime() || 0;
            const timeB = b.uploadedAt?.getTime() || 0;
            return timeB - timeA; // Descending order
          });
        }
        setFiles(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to files:', error);
        // If it's an index error, try a simpler query
        if (error.code === 'failed-precondition' && isCustomerUploadsFolder) {
          console.log('Retrying with simpler query (no orderBy)...');
          const simpleQuery = query(
            filesCollection,
            where('uploadedBy', '==', currentUser.uid)
          );
          const retryUnsubscribe = onSnapshot(
            simpleQuery,
            async (snapshot) => {
              const list = await Promise.all(
                snapshot.docs.map((docSnap) => mapDocToFileItem(docSnap, folderPath, projectId, currentUser.uid))
              );
              // Sort manually
              list.sort((a, b) => {
                const timeA = a.uploadedAt?.getTime() || 0;
                const timeB = b.uploadedAt?.getTime() || 0;
                return timeB - timeA;
              });
              setFiles(list);
              setLoading(false);
            },
            (retryError) => {
              console.error('Error on retry query:', retryError);
              setFiles([]);
              setLoading(false);
            }
          );
          return () => {
            retryUnsubscribe();
            unsubscribe();
          };
        }
        setFiles([]);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [project, folderPath, currentUser, projectId, t, isAdminOnlyFolder]);

  // Reset to page 1 when folder or files change
  useEffect(() => {
    setFilesCurrentPage(1);
  }, [folderPath, files.length]);

  const filesTotalPages = Math.max(1, Math.ceil(files.length / filesItemsPerPage));
  const filesStart = files.length === 0 ? 0 : (filesCurrentPage - 1) * filesItemsPerPage + 1;
  const filesEnd = Math.min(filesCurrentPage * filesItemsPerPage, files.length);
  const paginatedFiles = files.slice((filesCurrentPage - 1) * filesItemsPerPage, filesCurrentPage * filesItemsPerPage);

  async function handleMarkAsRead(file: FileItem) {
    if (!currentUser || !project || markingAsRead === file.cloudinaryPublicId) return;
    
    setMarkingAsRead(file.cloudinaryPublicId);
    try {
      // Mark file as read
      await markFileAsRead(projectId, currentUser.uid, file.cloudinaryPublicId);
      
      // Update read status in the file list
      file.isRead = true;
      
      // Update approval status for all files
          file.reportStatus = await getReportStatus(projectId, currentUser.uid, file.cloudinaryPublicId, true);
      
          // Update the file in the list
          setFiles(files.map(f => f.cloudinaryPublicId === file.cloudinaryPublicId ? file : f));
    } catch (error) {
      console.error('Error marking file as read:', error);
      alert(t('messages.error.generic'));
    } finally {
      setMarkingAsRead(null);
    }
  }

  async function handleApproveReport(file: FileItem) {
    if (!currentUser || !project) return;
    
    setApproving(file.cloudinaryPublicId);
    try {
      // Mark file as read when approving
      await markFileAsRead(projectId, currentUser.uid, file.cloudinaryPublicId);
      
      // Approve the file (this will update the pending document to approved)
      await approveReport(projectId, currentUser.uid, file.cloudinaryPublicId);
      
      // Update file status
      file.reportStatus = 'approved';
      file.isRead = true;
      setFiles(files.map(f => f.cloudinaryPublicId === file.cloudinaryPublicId ? file : f));
    } catch (error) {
      console.error('Error approving file:', error);
      alert(t('messages.error.generic'));
    } finally {
      setApproving(null);
    }
  }

  async function handleDeleteFile(file: FileItem) {
    if (!currentUser || !project || !canUpload) return;
    
    // Confirm deletion
    if (!confirm(t('projects.deleteFileConfirm', { fileName: file.fileName }))) {
      return;
    }
    
    setDeleting(file.cloudinaryPublicId);
    try {
      if (!db) {
        throw new Error('Database not initialized');
      }
      const dbInstance = db;

      // Delete from Cloudinary
      const deleteResponse = await fetch('/api/cloudinary/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicId: file.cloudinaryPublicId,
        }),
      });

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete file from Cloudinary');
      }

      // Delete from Firestore
      if (file.docId) {
        const segments = getFolderSegments(file.folderPath);
        const filesCollection = getProjectFolderRef(projectId, segments);
        // Use the collection reference directly to get the document reference
        const fileDocRef = doc(filesCollection, file.docId);
        await deleteDoc(fileDocRef);
      }

      // Remove from local state
      setFiles(files.filter(f => f.cloudinaryPublicId !== file.cloudinaryPublicId));
    } catch (error) {
      console.error('Error deleting file:', error);
      alert(t('projects.fileDeleteFailed'));
    } finally {
      setDeleting(null);
    }
  }

  function validateFile(file: File): string | null {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const fileType = file.type.toLowerCase();
    
    if (!allowedTypes.includes(fileType)) {
      return t('projects.fileTypeNotAllowed');
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return t('projects.fileSizeTooLarge');
    }

    return null;
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !project || !folderPath || !currentUser) {
      if (e.target) {
        e.target.value = '';
      }
      return;
    }

    setUploadError('');
    setUploadSuccess('');
    
    // Validate all files
    const validationErrors: string[] = [];
    const validFiles: File[] = [];
    
    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        validationErrors.push(`${file.name}: ${validationError}`);
      } else {
        validFiles.push(file);
      }
    }
    
    if (validationErrors.length > 0) {
      setUploadError(validationErrors.join('; '));
      if (e.target) {
        e.target.value = '';
      }
      return;
    }

    // Store files and show inline horizontal preview (no modal)
    setSelectedFiles(validFiles);
    setSelectedFile(validFiles[0]);
    // Reset input so same files can be selected again
    if (e.target) {
      e.target.value = '';
    }
  }

  function clearSelectedFiles() {
    setSelectedFiles([]);
    setSelectedFile(null);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function confirmUpload() {
    if (!selectedFiles.length || !selectedFiles[0] || !project || !folderPath || !currentUser) {
      setShowUploadPreview(false);
      setSelectedFiles([]);
      setSelectedFile(null);
      return;
    }

    setShowUploadPreview(false);
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');

    try {
      const folderPathFull = `projects/${projectId}/${folderPath}`;
      const uploadedFiles: string[] = [];
      
      // Upload files one by one
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const fileExtension = file.name.split('.').pop();
        const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const sanitizedBaseName = fileNameWithoutExt
          .replace(/\s+/g, '_')
          .replace(/[^a-zA-Z0-9._-]/g, '');
        const sanitizedFileName = `${sanitizedBaseName}.${fileExtension}`;
        // Remove extension from public_id (Cloudinary will add it back)
        const publicId = `${folderPathFull}/${sanitizedBaseName}`;
        const result = await uploadCloudinaryFile(file, folderPathFull, publicId);
        
        const segments = getFolderSegments(folderPath);
        const filesCollection = getProjectFolderRef(projectId, segments);
        const docId = result.public_id.split('/').pop() || result.public_id;
        
        await setDoc(doc(filesCollection, docId), {
          fileName: sanitizedFileName,
          cloudinaryPublicId: result.public_id,
          cloudinaryUrl: result.secure_url,
          uploadedAt: serverTimestamp(),
          uploadedBy: currentUser.uid,
        });

        uploadedFiles.push(sanitizedFileName);
      }

      // Best-effort email notification to admin (reuses admin-panel API)
      try {
        const adminApiBaseUrl = process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL;

        if (adminApiBaseUrl) {
          await fetch(`${adminApiBaseUrl}/api/notifications/file-upload`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId: projectId,
              filePath: uploadedFiles.join(', '),
              folderPath: folderPath,
              fileName: `${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''}`,
              isReport: false, // Customer uploads are not reports
            }),
          });
        }
      } catch (notifyError) {
        console.error('Error triggering file upload email notification:', notifyError);
        // Don't fail the upload if email notification fails
      }

      setUploadSuccess(t('projects.fileUploadSuccess', { count: uploadedFiles.length }));
      setSelectedFiles([]);
      setSelectedFile(null);
    } catch (error: any) {
      console.error('Error uploading files:', error);
      setUploadError(t('projects.fileUploadFailed', { error: error.message }));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmitMessage() {
    if (!customerMessage.trim() || !project || !currentUser) {
      return;
    }

    setSubmittingMessage(true);
    try {
      // Save message to Firestore
      if (!db) {
        throw new Error('Database not initialized');
      }
      
      await addDoc(collection(db, 'customerMessages'), {
        projectId: projectId,
        customerId: currentUser.uid,
        message: customerMessage.trim(),
        folderPath: folderPath,
        createdAt: serverTimestamp(),
        status: 'unread',
        messageType: 'additional_works_complaints'
      });

      // Send notification to admin
      try {
        const adminApiBaseUrl = process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL;
        if (adminApiBaseUrl) {
          await fetch(`${adminApiBaseUrl}/api/notifications/customer-message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId: projectId,
              projectName: project.name,
              customerId: currentUser.uid,
              message: customerMessage.trim(),
              folderPath: folderPath,
            }),
          });
        }
      } catch (notifyError) {
        console.error('Error sending message notification:', notifyError);
      }

      setCustomerMessage('');
      setUploadSuccess(t('projects.messageSentSuccess'));
      setTimeout(() => setUploadSuccess(''), 3000);
    } catch (error: any) {
      console.error('Error submitting message:', error);
      setUploadError(t('projects.messageSendFailed'));
    } finally {
      setSubmittingMessage(false);
    }
  }

  // Listen to customer messages for this folder (customer's own messages)
  useEffect(() => {
    if (!db || !projectId || !folderPath || !currentUser?.uid) {
      setCustomerMessagesList([]);
      return;
    }
    const q = query(
      collection(db, 'customerMessages'),
      where('projectId', '==', projectId),
      where('folderPath', '==', folderPath),
      where('customerId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          message: (data.message as string) || '',
          createdAt: data.createdAt?.toDate?.() ?? null,
          status: (data.status as string) || 'unread',
          updatedAt: data.updatedAt?.toDate?.() ?? null,
        };
      });
      list.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      setCustomerMessagesList(list);
    }, (err) => {
      console.error('Customer messages listener error:', err);
      setCustomerMessagesList([]);
    });
    return () => unsub();
  }, [projectId, folderPath, currentUser?.uid]);

  function handleEditMessage(id: string, currentMessage: string) {
    setEditingMessageId(id);
    setEditingMessageValue(currentMessage);
  }

  function handleCancelEdit() {
    setEditingMessageId(null);
    setEditingMessageValue('');
  }

  async function handleSaveEdit() {
    if (!editingMessageId || !editingMessageValue.trim() || editingMessageValue.length > 500 || !db) return;
    setSavingMessageId(editingMessageId);
    try {
      await updateDoc(doc(db, 'customerMessages', editingMessageId), {
        message: editingMessageValue.trim(),
        updatedAt: serverTimestamp(),
      });
      handleCancelEdit();
      setUploadSuccess(t('projects.messageUpdated'));
      setTimeout(() => setUploadSuccess(''), 3000);
    } catch (err) {
      console.error('Error updating message:', err);
      setUploadError(t('projects.messageUpdateFailed'));
    } finally {
      setSavingMessageId(null);
    }
  }

  function handleDeleteMessageClick(msg: { id: string; message: string }) {
    setMessageToDelete(msg);
  }

  function handleCancelDelete() {
    setMessageToDelete(null);
  }

  async function handleConfirmDeleteMessage() {
    if (!messageToDelete || !db) return;
    setDeletingMessageId(messageToDelete.id);
    try {
      await deleteDoc(doc(db, 'customerMessages', messageToDelete.id));
      setMessageToDelete(null);
      setUploadSuccess(t('projects.messageDeleted'));
      setTimeout(() => setUploadSuccess(''), 3000);
    } catch (err) {
      console.error('Error deleting message:', err);
      setUploadError(t('projects.messageDeleteFailed'));
    } finally {
      setDeletingMessageId(null);
    }
  }

  function cancelUpload() {
    setShowUploadPreview(false);
    setSelectedFiles([]);
    setSelectedFile(null);
  }

  async function handleDownloadFile(file: FileItem) {
    if (!currentUser || !project || downloading === file.cloudinaryPublicId) return;
    
    setDownloading(file.cloudinaryPublicId);
    
    try {
      // Mark file as read when downloading
      await markFileAsRead(projectId, currentUser.uid, file.cloudinaryPublicId);
      
      // Update read status in the file list
      file.isRead = true;
      
      // Update approval status for all files
      file.reportStatus = await getReportStatus(projectId, currentUser.uid, file.cloudinaryPublicId, true);
      
      // Update the file in the list
      setFiles(files.map(f => f.cloudinaryPublicId === file.cloudinaryPublicId ? file : f));
      
    } catch (error) {
      console.error('Error marking file as read:', error);
      // Don't block download if tracking fails
    }
    
    try {
      const isPDF = file.fileName.toLowerCase().endsWith('.pdf');
      
      // Determine MIME type based on file extension
      const getMimeType = (fileName: string): string => {
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.pdf')) return 'application/pdf';
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
        if (lower.endsWith('.png')) return 'image/png';
        return 'application/octet-stream';
      };

      const mimeType = getMimeType(file.fileName);
      
      // Fix PDF URLs: Convert /image/upload/ to /raw/upload/ if PDF is stored as image
      let downloadUrl = file.cloudinaryUrl;
      if (isPDF) {
        // Replace /image/upload/ with /raw/upload/ for PDFs stored incorrectly
        downloadUrl = downloadUrl.replace('/image/upload/', '/raw/upload/');
        
        // Add fl_attachment flag to force download
        if (!downloadUrl.includes('fl_attachment')) {
          const separator = downloadUrl.includes('?') ? '&' : '?';
          downloadUrl = `${downloadUrl}${separator}fl_attachment`;
        }
      }
      
      // Fetch the file with proper headers
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Accept': mimeType,
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        // If raw endpoint fails, try the original URL
        if (isPDF && downloadUrl.includes('/raw/upload/')) {
          const originalUrl = file.cloudinaryUrl + (file.cloudinaryUrl.includes('?') ? '&' : '?') + 'fl_attachment';
          const retryResponse = await fetch(originalUrl, {
            method: 'GET',
            headers: { 'Accept': mimeType },
            redirect: 'follow',
          });
          
          if (retryResponse.ok) {
            const blob = await retryResponse.blob();
            const typedBlob = new Blob([blob], { type: mimeType });
            const url = URL.createObjectURL(typedBlob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = file.fileName;
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            setTimeout(() => {
              document.body.removeChild(anchor);
              URL.revokeObjectURL(url);
            }, 100);
            return;
          }
        }
        
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      // Get the blob with explicit MIME type
      const blob = await response.blob();
      
      // Ensure correct MIME type for PDFs
      const typedBlob = blob.type && blob.type !== 'application/octet-stream'
        ? blob 
        : new Blob([blob], { type: mimeType });

      // Create download link
      const url = URL.createObjectURL(typedBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName;
      anchor.style.display = 'none';
      
      // Append to body, click, and remove
      document.body.appendChild(anchor);
      anchor.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error: any) {
      console.error('Download failed:', error);
      
      // For PDFs, try fallback: direct link with download attribute
      if (file.fileName.toLowerCase().endsWith('.pdf')) {
        try {
          // Try converting URL to raw endpoint
          let fallbackUrl = file.cloudinaryUrl.replace('/image/upload/', '/raw/upload/');
          if (!fallbackUrl.includes('fl_attachment')) {
            fallbackUrl += (fallbackUrl.includes('?') ? '&' : '?') + 'fl_attachment';
          }
          
          const anchor = document.createElement('a');
          anchor.href = fallbackUrl;
          anchor.download = file.fileName;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          document.body.appendChild(anchor);
          anchor.click();
          setTimeout(() => {
            document.body.removeChild(anchor);
          }, 100);
          return; // Success with fallback
        } catch (fallbackError) {
          console.error('Fallback download also failed:', fallbackError);
        }
      }
      
      alert(t('messages.error.generic'));
    } finally {
      setDownloading(null);
    }
  }

  function formatUploadedDate(date: Date | null): string {
    if (!date) return translateStatus('pending', t);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function getFileIcon(type: string): string {
    if (type.includes('pdf')) return '📄';
    if (type.includes('image')) return '🖼️';
    return '📎';
  }

  if (loading && !project) {
    return (
      <CustomerLayout title={t('common.loading')}>
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <div className="inline-block h-8 w-8 border-3 border-green-power-200 border-t-green-power-600 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-600 font-medium">{t('common.loading')}</p>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  if (error || !project || isAdminOnlyFolder) {
    return (
      <CustomerLayout title={t('messages.error.generic')}>
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm mb-4 rounded">
              {error || t('messages.error.notFound')}
            </div>
            <Link
              href="/dashboard"
              className="inline-block text-sm text-green-power-600 hover:text-green-power-700 font-medium"
            >
              ← {t('common.back')} {t('navigation.dashboard')}
            </Link>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  // Build full folder path display (parent folder > subfolder); use custom names if set by admin
  const getFullFolderPath = () => {
    const pathParts = folderPath.split('/').filter(Boolean);
    const names = project?.folderDisplayNames;
    if (pathParts.length > 1) {
      const parentName = getProjectFolderDisplayName(pathParts[0], names, t);
      const subName = getProjectFolderDisplayName(folderPath, names, t);
      return `${parentName} > ${subName}`;
    }
    return getProjectFolderDisplayName(folderPath, names, t);
  };

  const fullFolderPath = getFullFolderPath();
  const pageTitle = `${project.name} - ${fullFolderPath}`;

  return (
    <CustomerLayout title={pageTitle}>
      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center text-sm text-gray-600 hover:text-green-power-700 transition-colors mb-4 group"
          >
            <svg className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('common.back')} {project.name}
          </Link>
        </div>

        {/* Project Header Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="px-6 py-5 bg-gradient-to-r from-green-power-50 via-green-power-50 to-emerald-50 border-b border-green-power-100">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              {project.year && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/60 backdrop-blur-sm border border-green-power-200 text-xs font-medium text-gray-700">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {project.year}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="font-medium text-gray-700">{fullFolderPath}</span>
                </div>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-white/60 backdrop-blur-sm border border-green-power-200 ml-4">
                <span className="text-xs font-semibold text-green-power-700">
                  {files.length} {files.length === 1 ? t('projects.file') : t('projects.files')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        {canUpload && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
              <h3 className="text-base font-semibold text-gray-900">{t('projects.uploadFile')}</h3>
                  <p className="text-xs text-gray-600">PDF, JPG, PNG ({t('projects.maxFileSize')})</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              {uploadError && (
                <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-sm text-red-700 font-medium">{uploadError}</p>
                </div>
              )}
              {uploadSuccess && !uploadError && (
                <div className="mb-4 p-4 rounded-xl bg-green-50 border border-green-200 flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-sm text-green-700 font-medium">{uploadSuccess}</p>
                </div>
              )}
              <div className="space-y-4">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) fileInputRef.current?.click(); }}
                  className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-green-power-400 hover:bg-green-power-50/50 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-1"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    multiple
                    className="sr-only"
                  />
                  <div className="space-y-2 text-center pointer-events-none">
                    {uploading ? (
                      <>
                        <div className="inline-block h-8 w-8 border-2 border-green-power-200 border-t-green-power-600 rounded-full animate-spin"></div>
                        <p className="text-sm text-gray-600 font-medium">{t('projects.uploading')}</p>
                      </>
                    ) : (
                      <>
                        <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div className="flex text-sm text-gray-600 justify-center">
                          <span className="font-medium text-green-power-600">{t('projects.clickToUpload')}</span>
                          <p className="pl-1">{t('projects.orDragAndDrop')}</p>
                        </div>
                        <p className="text-xs text-gray-500">{t('projects.fileTypesAndSize')}</p>
                      </>
                    )}
                  </div>
                </div>
                {selectedFiles.length > 0 && !uploading && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700">{t('projects.selectedFiles', { count: selectedFiles.length })}</p>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {selectedFiles.map((file, idx) => {
                        const isImage = /\.(jpg|jpeg|png)$/i.test(file.name);
                        const isPdf = /\.pdf$/i.test(file.name);
                        return (
                          <div key={idx} className="flex-shrink-0 w-24 text-center">
                            {isImage ? (
                              <ImagePreviewThumb file={file} />
                            ) : (
                              <div className="w-24 h-24 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                                <span className="text-2xl">{isPdf ? '📄' : '📁'}</span>
                              </div>
                            )}
                            <p className="text-xs text-gray-600 truncate mt-1 max-w-[6rem]" title={file.name}>{file.name}</p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={confirmUpload}
                        className="px-4 py-2 bg-green-power-500 text-white text-sm font-medium rounded-sm hover:bg-green-power-600"
                      >
                        {t('projects.uploadFiles', { count: selectedFiles.length })}
                      </button>
                      <button
                        type="button"
                        onClick={clearSelectedFiles}
                        className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-sm hover:bg-gray-50"
                      >
                        {t('common.clear')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Files Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-50/50 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t('projects.files')}</h3>
            {isReportFolder && (
                  <p className="text-xs text-gray-600 mt-1">{t('projects.reviewAndApproveReports')}</p>
            )}
                {!canUpload && !isReportFolder && (
                  <p className="text-xs text-gray-600 mt-1">{t('projects.viewDownloadApprove')}</p>
            )}
          </div>
            </div>
          </div>
          
          {loading ? (
            <div className="p-16 text-center">
              <div className="inline-block h-10 w-10 border-3 border-green-power-200 border-t-green-power-600 rounded-full animate-spin"></div>
              <p className="mt-4 text-sm text-gray-600 font-medium">{t('projects.loadingFiles')}</p>
            </div>
          ) : files.length === 0 ? (
            <div className="p-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <p className="text-base font-medium text-gray-700 mb-1">
                {t('projects.noFiles')}
              </p>
              <p className="text-sm text-gray-500">
                {canUpload ? t('projects.uploadFirstFile') : t('projects.filesWillAppear')}
              </p>
            </div>
          ) : (
            <>
            <div className="divide-y divide-gray-100">
              {paginatedFiles.map((file, idx) => {
                // Ensure status is always set for all files (default to 'unread' if missing)
                const status = file.reportStatus || 'unread';
                
                return (
                  <div 
                    key={file.cloudinaryPublicId} 
                    className="px-4 py-3 hover:bg-gray-50 transition-colors group border-b border-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      {/* File Icon */}
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                        <span className="text-lg">{getFileIcon(file.fileType)}</span>
                      </div>
                      
                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-sm font-medium text-gray-900 break-words">
                              {file.fileName}
                              </span>
                              {/* Show approval status for all files (NOT in customer uploads) */}
                              {!canUpload && status && status === 'approved' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 border border-green-200">
                                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                  {translateStatus('approved', t)}
                              </span>
                            )}
                              {/* Show unread status only (NOT in customer uploads) */}
                              {!canUpload && !file.isRead && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                  <div className="w-1.5 h-1.5 rounded-full bg-current"></div>
                                  {translateStatus('unread', t)}
                                </span>
                              )}
                        </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500">
                              <span className="px-1.5 py-0.5 rounded bg-gray-100 font-medium text-gray-700">
                                {file.fileType.toUpperCase()}
                              </span>
                              <span className="flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatUploadedDate(file.uploadedAt)}
                              </span>
                      </div>
                      </div>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Mark as Read button - show for unread files (NOT in customer uploads) */}
                            {!canUpload && !file.isRead && (
                              <button
                                onClick={() => handleMarkAsRead(file)}
                                disabled={markingAsRead === file.cloudinaryPublicId}
                                className="px-2.5 py-1.5 text-[10px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                {markingAsRead === file.cloudinaryPublicId ? (
                                  <>
                                    <div className="w-2.5 h-2.5 border-2 border-blue-700 border-t-transparent rounded-full animate-spin"></div>
                                    {t('common.loading')}
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                    </svg>
                                    {t('projects.markRead')}
                                  </>
                                )}
                              </button>
                            )}
                            {/* Delete button - show only in customer uploads */}
                            {canUpload && (
                              <button
                                onClick={() => handleDeleteFile(file)}
                                disabled={deleting === file.cloudinaryPublicId}
                                className="px-2.5 py-1.5 text-[10px] font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                {deleting === file.cloudinaryPublicId ? (
                                  <>
                                    <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    {t('common.loading')}
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    {t('common.delete')}
                                  </>
                                )}
                              </button>
                            )}
                            {/* Approve button for all files (NOT in customer uploads) */}
                        {!canUpload && status !== 'approved' && (
                          <button
                            onClick={() => handleApproveReport(file)}
                            disabled={approving === file.cloudinaryPublicId}
                                className="px-2.5 py-1.5 text-[10px] font-medium text-white bg-green-power-600 hover:bg-green-power-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                {approving === file.cloudinaryPublicId ? (
                                  <>
                                    <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    {t('common.loading')}
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                    {t('projects.approve')}
                                  </>
                                )}
                              </button>
                            )}
                            {/* Download button */}
                            <button
                              type="button"
                              onClick={() => handleDownloadFile(file)}
                              disabled={downloading === file.cloudinaryPublicId}
                              className="px-2.5 py-1.5 text-[10px] font-medium text-white bg-gray-600 hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              {downloading === file.cloudinaryPublicId ? (
                                <>
                                  <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                  {t('common.loading')}
                                </>
                              ) : (
                                <>
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                              {t('common.download')}
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {(files.length > filesItemsPerPage || filesItemsPerPage !== 10) && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-gray-50 border-t border-gray-100">
                <div className="flex items-center gap-1.5 text-sm text-gray-600 flex-wrap">
                  <span>{t('projects.showing')}</span>
                  <span className="font-medium">{filesStart}</span>
                  <span>{t('projects.to')}</span>
                  <span className="font-medium">{filesEnd}</span>
                  <span>{t('projects.of')}</span>
                  <span className="font-medium">{files.length}</span>
                  <span>{t('projects.results')}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-sm text-gray-600">{t('projects.itemsPerPage')}</label>
                  <select
                    value={filesItemsPerPage}
                    onChange={(e) => {
                      setFilesItemsPerPage(Number(e.target.value));
                      setFilesCurrentPage(1);
                    }}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  {filesTotalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setFilesCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={filesCurrentPage === 1}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('common.previous')}
                      </button>
                      <span className="px-3 py-1.5 text-sm text-gray-600">
                        {filesCurrentPage} / {filesTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFilesCurrentPage((p) => Math.min(filesTotalPages, p + 1))}
                        disabled={filesCurrentPage === filesTotalPages}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('common.next')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            </>
          )}
        </div>

        {/* Customer Message Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-6">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50/30 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">{t('projects.additionalWorksComplaints')}</h3>
              </div>
              <p className="text-sm text-gray-600 mt-1">{t('projects.messageDescription')}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowMessageForm(true);
                setTimeout(() => {
                  messageFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  document.getElementById('customerMessage')?.focus();
                }, 100);
              }}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center gap-2 flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              {t('projects.report')}
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Message form – above the list; shown when Report is clicked (or always after first open) */}
            {showMessageForm && (
              <div ref={messageFormRef} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-4">
                <h4 className="text-sm font-medium text-gray-800">{t('projects.yourMessage')}</h4>
                <textarea
                  id="customerMessage"
                  value={customerMessage}
                  onChange={(e) => setCustomerMessage(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none bg-white"
                  placeholder={t('projects.messagePlaceholder')}
                  disabled={submittingMessage}
                />
                <p className="text-xs text-gray-500">
                  {customerMessage.length}/500 {t('common.characters')}
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={handleSubmitMessage}
                    disabled={!customerMessage.trim() || submittingMessage || customerMessage.length > 500}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {submittingMessage ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {t('common.sending')}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        {t('common.sendMessage')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Messages list – clean card-style layout */}
            {customerMessagesList.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-800 mb-3">{t('projects.yourMessages')}</h4>
                <ul className="space-y-3">
                  {customerMessagesList.map((msg) => (
                    <li key={msg.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                      <div className="p-4">
                        {editingMessageId === msg.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={editingMessageValue}
                              onChange={(e) => setEditingMessageValue(e.target.value)}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                              maxLength={500}
                            />
                            <p className="text-xs text-gray-500">{editingMessageValue.length}/500</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={handleSaveEdit}
                                disabled={savingMessageId === msg.id || !editingMessageValue.trim() || editingMessageValue.length > 500}
                                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                              >
                                {savingMessageId === msg.id ? t('common.saving') : t('common.save')}
                              </button>
                              <button type="button" onClick={handleCancelEdit} className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
                                {t('common.cancel')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{msg.message}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="text-xs text-gray-500">
                                {msg.createdAt ? msg.createdAt.toLocaleString() : ''}
                                {msg.updatedAt ? ` · ${t('projects.edited')} ${msg.updatedAt.toLocaleString()}` : ''}
                              </span>
                              {msg.status === 'resolved' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                  {t('projects.resolved')}
                                </span>
                              )}
                            </div>
                            {msg.status !== 'resolved' && (
                              <div className="mt-3 pt-3 border-t border-gray-100 flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleEditMessage(msg.id, msg.message)}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                                >
                                  {t('common.edit')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessageClick({ id: msg.id, message: msg.message })}
                                  disabled={deletingMessageId === msg.id}
                                  className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
                                >
                                  {deletingMessageId === msg.id ? t('common.loading') : t('common.delete')}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {messageToDelete && (
                  <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-amber-800">{t('projects.deleteMessageConfirm')}</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleCancelDelete} className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 bg-white">
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDeleteMessage}
                        disabled={deletingMessageId === messageToDelete.id}
                        className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        {deletingMessageId === messageToDelete.id ? t('common.loading') : t('common.delete')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* File Upload Preview Modal */}
      <FileUploadPreviewModal
        isOpen={showUploadPreview}
        file={selectedFile}
        folderPath={folderPath}
        onConfirm={confirmUpload}
        onCancel={cancelUpload}
      />
    </CustomerLayout>
  );
}

export default function FolderViewPage() {
  return (
    <ProtectedRoute>
      <FolderViewContent />
    </ProtectedRoute>
  );
}
