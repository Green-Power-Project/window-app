'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useLayoutTitle } from '@/contexts/LayoutTitleContext';
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
import { PROJECT_FOLDER_STRUCTURE, formatFolderName, isAdminOnlyFolderPath, isCustomFolderPath } from '@/lib/folderStructure';
import { markFileAsRead, isFileRead } from '@/lib/fileReadTracking';
import { getReportStatus, approveReport, ReportStatus } from '@/lib/reportApproval';
import { getGalleryImages } from '@/lib/galleryClient';
import { getAdminPanelBaseUrl } from '@/lib/adminPanelUrl';
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
  customFolders?: string[];
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

/** Preloaded read/approval sets to avoid N getDocs per file (batch load once per project+customer). */
export type ReadApprovalPreloaded = {
  readFilePaths: Set<string>;
  approvedFilePaths: Set<string>;
};

async function mapDocToFileItem(
  docSnap: any,
  folderPath: string,
  projectId?: string,
  customerId?: string,
  preloaded?: ReadApprovalPreloaded
): Promise<FileItem> {
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

  if (projectId && customerId) {
    if (preloaded) {
      fileItem.isRead = preloaded.readFilePaths.has(cloudinaryPublicId);
      fileItem.reportStatus = preloaded.approvedFilePaths.has(cloudinaryPublicId)
        ? 'approved'
        : fileItem.isRead
          ? 'read'
          : 'unread';
    } else {
      try {
        fileItem.isRead = await isFileRead(projectId, customerId, cloudinaryPublicId);
      } catch (error) {
        console.warn('Error checking file read status, defaulting to unread:', error);
        fileItem.isRead = false;
      }
      try {
        fileItem.reportStatus = await getReportStatus(projectId, customerId, cloudinaryPublicId, fileItem.isRead);
      } catch (error) {
        console.warn('Error loading approval status, defaulting to unread:', error);
        fileItem.reportStatus = 'unread';
      }
    }
  } else {
    fileItem.isRead = false;
    fileItem.reportStatus = 'unread';
  }

  return fileItem;
}

function FolderViewContent() {
  const { t } = useLanguage();
  const params = useParams();
  const { currentUser } = useAuth();
  const { setTitle } = useLayoutTitle();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [markingAsRead, setMarkingAsRead] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [uploadPopupOpen, setUploadPopupOpen] = useState(false);
  const [customerMessage, setCustomerMessage] = useState('');
  const [submittingMessage, setSubmittingMessage] = useState(false);
  const [customerMessagesList, setCustomerMessagesList] = useState<Array<{ id: string; message: string; createdAt: Date | null; status: string; updatedAt?: Date | null; subject?: string; fileName?: string; filePath?: string }>>([]);
  const [commentChoiceFile, setCommentChoiceFile] = useState<FileItem | null>(null);
  const [commentForFile, setCommentForFile] = useState<FileItem | null>(null);
  const [commentListForFile, setCommentListForFile] = useState<FileItem | null>(null);
  const [commentSubject, setCommentSubject] = useState('');
  const [commentMessage, setCommentMessage] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageValue, setEditingMessageValue] = useState('');
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<{ id: string; message: string } | null>(null);
  const [showMessageForm, setShowMessageForm] = useState(false);
  const [projectGalleryImages, setProjectGalleryImages] = useState<Array<{ id: string; url: string; category: string; title: string }>>([]);
  /** Batch-loaded read/approval sets to avoid N getDocs per file; null until loaded. */
  const [readApprovalPreloaded, setReadApprovalPreloaded] = useState<ReadApprovalPreloaded | null>(null);
  const readApprovalPreloadedRef = useRef<ReadApprovalPreloaded | null>(null);
  readApprovalPreloadedRef.current = readApprovalPreloaded;

  const COMMENT_SUBJECT_OPTIONS = [
    { value: 'not_accepted', labelKey: 'projects.commentSubjectNotAccepted' },
    { value: 'correction_needed', labelKey: 'projects.commentSubjectCorrectionNeeded' },
    { value: 'question', labelKey: 'projects.commentSubjectQuestion' },
    { value: 'complaint', labelKey: 'projects.commentSubjectComplaint' },
  ] as const;
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

  const canUpload = folderPath.startsWith('01_Customer_Uploads') || (isCustomFolderPath(folderPath) && project?.customFolders?.includes(folderPath));
  const isReportFolder = folderPath.startsWith('03_Reports');
  const isAdminOnlyFolder = isAdminOnlyFolderPath(folderPath);
  const isCustomFolder = isCustomFolderPath(folderPath);
  const isAllowedFolder = !isAdminOnlyFolder && (
    PROJECT_FOLDER_STRUCTURE.some((f) => f.path === folderPath || f.children?.some((c) => c.path === folderPath)) ||
    (isCustomFolder && project?.customFolders?.includes(folderPath))
  );

  useEffect(() => {
    if (loading && !project) setTitle(t('common.loading'));
    else if (error || !project) setTitle(t('messages.error.generic'));
    else if (project) setTitle(project.name);
    return () => setTitle(null);
  }, [loading, error, project, t, setTitle]);

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

  // Fetch gallery images linked to this project (client-side; does not require login)
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const list = await getGalleryImages(db, projectId);
      if (!cancelled) setProjectGalleryImages(list);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

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

  // Batch-load read and approval status once per project+customer (avoids N getDocs per file)
  useEffect(() => {
    if (!projectId || !currentUser?.uid || !db) {
      setReadApprovalPreloaded(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [readSnap, approvalSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'fileReadStatus'),
              where('projectId', '==', projectId),
              where('customerId', '==', currentUser.uid)
            )
          ),
          getDocs(
            query(
              collection(db, 'reportApprovals'),
              where('projectId', '==', projectId),
              where('customerId', '==', currentUser.uid),
              where('status', '==', 'approved')
            )
          ),
        ]);
        if (cancelled) return;
        const readFilePaths = new Set<string>();
        readSnap.forEach((d) => readFilePaths.add(d.data().filePath));
        const approvedFilePaths = new Set<string>();
        approvalSnap.forEach((d) => approvedFilePaths.add(d.data().filePath));
        setReadApprovalPreloaded({ readFilePaths, approvedFilePaths });
      } catch (err) {
        if (!cancelled) setReadApprovalPreloaded(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, currentUser?.uid]);

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
            mapDocToFileItem(docSnap, folderPathValue, projectId, currentUser.uid, readApprovalPreloaded ?? undefined)
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
  }, [project, currentUser, projectId, t, readApprovalPreloaded]);

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
    
    // Customer uploads and custom folders: filter by uploadedBy so customer only sees their files
    const isCustomerUploadsFolder = folderPath.startsWith('01_Customer_Uploads');
    const isCustomFolderUploads = isCustomFolderPath(folderPath);
    const filterByCustomer = isCustomerUploadsFolder || isCustomFolderUploads;
    let filesQuery;
    
    if (filterByCustomer) {
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
        const preloaded = readApprovalPreloadedRef.current ?? undefined;
        const list = await Promise.all(
          snapshot.docs.map((docSnap) =>
            mapDocToFileItem(docSnap, folderPath, projectId, currentUser.uid, preloaded)
          )
        );
        // Sort manually if orderBy wasn't used
        if (filterByCustomer && list.length > 0 && !list[0].uploadedAt) {
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
        if (error.code === 'failed-precondition' && filterByCustomer) {
          console.log('Retrying with simpler query (no orderBy)...');
          const simpleQuery = query(
            filesCollection,
            where('uploadedBy', '==', currentUser.uid)
          );
          const retryUnsubscribe = onSnapshot(
            simpleQuery,
            async (snapshot) => {
              const preloaded = readApprovalPreloadedRef.current ?? undefined;
              const list = await Promise.all(
                snapshot.docs.map((docSnap) =>
                  mapDocToFileItem(docSnap, folderPath, projectId, currentUser.uid, preloaded)
                )
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
  }, [project, folderPath, currentUser, projectId, t, isAdminOnlyFolder, isCustomFolder]);

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
      // Keep batch cache in sync so next snapshot uses it
      setReadApprovalPreloaded((prev) => {
        if (!prev) return prev;
        const next = new Set(prev.readFilePaths);
        next.add(file.cloudinaryPublicId);
        return { readFilePaths: next, approvedFilePaths: prev.approvedFilePaths };
      });
      file.isRead = true;
      file.reportStatus = await getReportStatus(projectId, currentUser.uid, file.cloudinaryPublicId, true);
      setFiles((prev) => prev.map((f) => (f.cloudinaryPublicId === file.cloudinaryPublicId ? file : f)));
      // Best-effort admin email notification: customer opened a file
      try {
        const adminPanelBaseUrl = getAdminPanelBaseUrl();
        if (adminPanelBaseUrl) {
          await fetch(`${adminPanelBaseUrl}/api/notifications/file-activity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: 'read',
              projectId,
              projectName: project.name,
              customerId: currentUser.uid,
              folderPath,
              filePath: file.cloudinaryPublicId,
              fileName: file.fileName,
            }),
          });
        }
      } catch (notifyError) {
        console.error('Error triggering file read notification:', notifyError);
      }
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
      // Keep batch cache in sync
      setReadApprovalPreloaded((prev) => {
        if (!prev) return prev;
        const r = new Set(prev.readFilePaths);
        r.add(file.cloudinaryPublicId);
        const a = new Set(prev.approvedFilePaths);
        a.add(file.cloudinaryPublicId);
        return { readFilePaths: r, approvedFilePaths: a };
      });
      file.reportStatus = 'approved';
      file.isRead = true;
      setFiles((prev) => prev.map((f) => (f.cloudinaryPublicId === file.cloudinaryPublicId ? file : f)));
      // Best-effort admin email notification: customer approved a report
      try {
        const adminPanelBaseUrl = getAdminPanelBaseUrl();
        if (adminPanelBaseUrl) {
          await fetch(`${adminPanelBaseUrl}/api/notifications/file-activity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: 'approved',
              projectId,
              projectName: project.name,
              customerId: currentUser.uid,
              folderPath,
              filePath: file.cloudinaryPublicId,
              fileName: file.fileName,
            }),
          });
        }
      } catch (notifyError) {
        console.error('Error triggering report approval notification:', notifyError);
      }
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

    const maxSize = 20 * 1024 * 1024;
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

  function handleDropFiles(files: File[]) {
    if (files.length === 0 || !project || !folderPath || !currentUser) return;
    setUploadError('');
    setUploadSuccess('');
    const validationErrors: string[] = [];
    const validFiles: File[] = [];
    for (const file of files) {
      const err = validateFile(file);
      if (err) validationErrors.push(`${file.name}: ${err}`);
      else validFiles.push(file);
    }
    if (validationErrors.length > 0) {
      setUploadError(validationErrors.join('; '));
      return;
    }
    setSelectedFiles(validFiles);
    setSelectedFile(validFiles[0]);
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
        const adminPanelBaseUrl = getAdminPanelBaseUrl();
        if (adminPanelBaseUrl) {
          await fetch(`${adminPanelBaseUrl}/api/notifications/file-upload`, {
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
      setUploadPopupOpen(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('project-files-changed', { detail: { projectId } }));
      }
    } catch (error: any) {
      console.error('Error uploading files:', error);
      setUploadError(t('projects.fileUploadFailed', { error: error.message }));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmitFileComment() {
    if (!commentForFile || !commentSubject.trim() || !commentMessage.trim() || !project || !currentUser || !db) {
      return;
    }
    setSubmittingMessage(true);
    try {
      await addDoc(collection(db, 'customerMessages'), {
        projectId,
        customerId: currentUser.uid,
        message: commentMessage.trim(),
        subject: commentSubject.trim(),
        filePath: commentForFile.cloudinaryPublicId,
        fileName: commentForFile.fileName,
        folderPath,
        createdAt: serverTimestamp(),
        status: 'unread',
        messageType: 'additional_works_complaints',
      });
      try {
        const adminPanelBaseUrl = getAdminPanelBaseUrl();
        if (adminPanelBaseUrl) {
          await fetch(`${adminPanelBaseUrl}/api/notifications/customer-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              projectName: project.name,
              customerId: currentUser.uid,
              message: commentMessage.trim(),
              subject: commentSubject.trim(),
              fileName: commentForFile.fileName,
              filePath: commentForFile.cloudinaryPublicId,
              folderPath,
            }),
          });
        }
      } catch (notifyError) {
        console.error('Error sending message notification:', notifyError);
      }
      setCommentForFile(null);
      setCommentSubject('');
      setCommentMessage('');
      setUploadSuccess(t('projects.messageSentSuccess'));
      setTimeout(() => setUploadSuccess(''), 3000);
    } catch (error: any) {
      console.error('Error submitting file comment:', error);
      setUploadError(t('projects.messageSendFailed'));
    } finally {
      setSubmittingMessage(false);
    }
  }

  async function handleSubmitMessage() {
    if (!customerMessage.trim() || !project || !currentUser) {
      return;
    }

    setSubmittingMessage(true);
    try {
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

      try {
        const adminPanelBaseUrl = getAdminPanelBaseUrl();
        if (adminPanelBaseUrl) {
          await fetch(`${adminPanelBaseUrl}/api/notifications/customer-message`, {
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
          subject: (data.subject as string) || undefined,
          fileName: (data.fileName as string) || undefined,
          filePath: (data.filePath as string) || undefined,
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

  // Messages stay "unread" until admin marks them as read in the admin panel.

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

  function getViewUrl(file: FileItem): string {
    const lower = file.fileName.toLowerCase();
    if (lower.endsWith('.pdf')) {
      return file.cloudinaryUrl.replace('/image/upload/', '/raw/upload/');
    }
    return file.cloudinaryUrl;
  }

  function isImagePreviewable(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].some((ext) => lower.endsWith(ext));
  }

  async function handleViewFile(file: FileItem) {
    if (!currentUser || !project) return;

    try {
      await markFileAsRead(projectId, currentUser.uid, file.cloudinaryPublicId);
      setReadApprovalPreloaded((prev) => {
        if (!prev) return prev;
        const next = new Set(prev.readFilePaths);
        next.add(file.cloudinaryPublicId);
        return { readFilePaths: next, approvedFilePaths: prev.approvedFilePaths };
      });
      const reportStatus = await getReportStatus(projectId, currentUser.uid, file.cloudinaryPublicId, true);
      setFiles((prev) =>
        prev.map((f) =>
          f.cloudinaryPublicId === file.cloudinaryPublicId ? { ...f, isRead: true, reportStatus } : f
        )
      );
      // Use updated file for preview/open so modal shows correct state
      file = { ...file, isRead: true, reportStatus };
    } catch (err) {
      console.error('Error marking file as read on view:', err);
    }

    const lower = file.fileName.toLowerCase();
    // Open in-portal viewer for all file types (no new tab, URL not revealed)
    setPreviewFile(file);
  }

  async function handleDownloadFile(file: FileItem) {
    if (!currentUser || !project || downloading === file.cloudinaryPublicId) return;
    
    setDownloading(file.cloudinaryPublicId);
    
    try {
      await markFileAsRead(projectId, currentUser.uid, file.cloudinaryPublicId);
      setReadApprovalPreloaded((prev) => {
        if (!prev) return prev;
        const next = new Set(prev.readFilePaths);
        next.add(file.cloudinaryPublicId);
        return { readFilePaths: next, approvedFilePaths: prev.approvedFilePaths };
      });
      file.isRead = true;
      file.reportStatus = await getReportStatus(projectId, currentUser.uid, file.cloudinaryPublicId, true);
      setFiles((prev) => prev.map((f) => (f.cloudinaryPublicId === file.cloudinaryPublicId ? file : f)));
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
      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="inline-block h-8 w-8 border-3 border-green-power-200 border-t-green-power-600 rounded-full animate-spin" />
          <p className="mt-4 text-sm text-gray-600 font-medium">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const folderNotAllowed = isAdminOnlyFolder || (isCustomFolder && project && !project.customFolders?.includes(folderPath));
  if (error || !project || folderNotAllowed) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm mb-4 rounded">
            {error || t('messages.error.notFound')}
          </div>
          <Link
            href={project ? `/project/${projectId}` : '/dashboard'}
            className="inline-block text-sm text-green-power-600 hover:text-green-power-700 font-medium"
          >
            ← {t('common.back')} {project ? project.name : t('navigation.dashboard')}
          </Link>
        </div>
      </div>
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

  const projectTitle = project.year != null ? `${project.name} – ${project.year}` : project.name;
  const folderDisplayName = getProjectFolderDisplayName(folderPath, project.folderDisplayNames, t);

  return (
    <div className="relative min-h-screen w-full">
        {/* Full-screen background image from public folder – low visibility */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-[0.5]"
          style={{ backgroundImage: 'url(/desktop-bg.png)' }}
          aria-hidden
        />
        <div className="relative z-10 min-h-full">
        <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          {/* Top container: breadcrumb, project name, and Upload */}
          <div className="rounded-2xl bg-white/95 backdrop-blur-sm border border-gray-100 shadow-xl px-4 sm:px-6 py-4 sm:py-5 mb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Link
                  href={`/project/${projectId}`}
                  className="inline-flex items-center text-sm text-gray-600 hover:text-green-power-700 transition-colors mb-2 group"
                >
                  <svg className="w-4 h-4 mr-1.5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t('common.back')} to {project.name} → <span className="font-medium text-gray-800 ml-1">{folderDisplayName}{project.year != null ? ` (${project.year})` : ''}</span>
                </Link>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{projectTitle}</h1>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {canUpload && (
                  <button
                    type="button"
                    onClick={() => setUploadPopupOpen(true)}
                    disabled={uploading}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-power-600 text-white text-sm font-semibold shadow-md hover:bg-green-power-700 transition-colors disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {t('projects.uploadFile')}
                  </button>
                )}
              </div>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            multiple
            className="sr-only"
          />

        {/* Gallery / Our Previous Work – project-linked gallery images (offer-style cards) */}
        {projectGalleryImages.length > 0 && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100/80 mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100/80">
              <h3 className="text-base font-semibold text-gray-900">{t('projects.galleryOurWork')}</h3>
              <p className="text-xs text-gray-600 mt-0.5">{t('projects.galleryOurWorkDescription')}</p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
                {projectGalleryImages.slice(0, 10).map((img) => (
                  <a
                    key={img.id}
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col rounded-xl overflow-hidden bg-white border border-gray-100 transition-all duration-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2"
                    style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)' }}
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100 flex-shrink-0">
                      <img src={img.url} alt={img.title || img.category} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    </div>
                    <div className="flex flex-col flex-1 p-2 sm:p-2.5 border-t border-gray-100 min-h-0" style={{ background: 'linear-gradient(180deg, #ffffff 0%, rgba(248,250,249,0.98) 100%)' }}>
                      <p className="text-xs font-bold text-gray-900 line-clamp-2 leading-tight mb-2">{img.title || img.category || '—'}</p>
                      <span className="mt-auto w-full inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)', boxShadow: '0 2px 6px rgba(93, 138, 106, 0.3)' }}>
                        {t('gallery.viewCategory')}
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                      </span>
                    </div>
                  </a>
                ))}
              </div>
              {projectGalleryImages.length > 10 && (
                <p className="text-xs text-gray-500 mt-3">{t('projects.galleryShowing', { count: 10, total: projectGalleryImages.length })}</p>
              )}
              <Link
                href="/s-gallery"
                className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-green-power-600 hover:text-green-power-700"
              >
                {t('projects.viewFullGallery')}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
          </div>
        )}

          {/* Files Section – no outer container; elevated cards like gallery */}
          {loading ? (
            <div className="py-20 text-center">
              <div className="inline-block h-10 w-10 border-2 border-green-power-200 border-t-green-power-600 rounded-full animate-spin" />
              <p className="mt-4 text-sm text-gray-600 font-medium">{t('projects.loadingFiles')}</p>
            </div>
          ) : files.length === 0 ? (
            <div className="py-20 text-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <p className="text-base font-medium text-gray-700 mb-1">{t('projects.noFiles')}</p>
              <p className="text-sm text-gray-500">{canUpload ? t('projects.uploadFirstFile') : t('projects.filesWillAppear')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 mb-6">
              {paginatedFiles.map((file) => {
                const status = file.reportStatus || 'unread';
                const isImage = file.fileType === 'image';
                return (
                  <div
                    key={file.cloudinaryPublicId}
                    className="group rounded-2xl border-2 border-white/70 bg-white/95 shadow-xl overflow-hidden hover:shadow-2xl hover:border-green-power-200/70 transition-all duration-300 hover:-translate-y-0.5"
                    style={{ boxShadow: '0 10px 40px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.5)' }}
                  >
                        {/* Thumbnail – click to open file */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => handleViewFile(file)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleViewFile(file); } }}
                          className="aspect-[4/3] bg-gray-50 relative overflow-hidden cursor-pointer"
                        >
                          {isImage ? (
                            <img
                              src={file.cloudinaryUrl}
                              alt=""
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                              <span className="text-5xl opacity-80">📄</span>
                            </div>
                          )}
                          {!canUpload && status === 'approved' && (
                            <span className="absolute top-2 right-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-600 text-white shadow-sm">
                              {translateStatus('approved', t)}
                            </span>
                          )}
                          {!canUpload && !file.isRead && (
                            <span className="absolute top-2 right-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500 text-white shadow-sm">
                              {translateStatus('unread', t)}
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          <p className="text-sm font-semibold text-gray-900 truncate leading-tight" title={file.fileName}>{file.fileName}</p>
                          <p className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                            <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatUploadedDate(file.uploadedAt)}
                          </p>
                          <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-gray-100">
                            {!canUpload && !file.isRead && (
                              <button
                                onClick={() => handleMarkAsRead(file)}
                                disabled={markingAsRead === file.cloudinaryPublicId}
                                className="w-9 h-9 rounded-xl bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-600 disabled:opacity-50 transition-colors"
                                title={t('projects.markRead')}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
                            )}
                            {!canUpload && status !== 'approved' && (
                              <button
                                onClick={() => handleApproveReport(file)}
                                disabled={approving === file.cloudinaryPublicId}
                                className="w-9 h-9 rounded-xl bg-green-power-50 hover:bg-green-power-100 flex items-center justify-center text-green-power-600 disabled:opacity-50 transition-colors"
                                title={t('projects.approve')}
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleViewFile(file)}
                              className="w-9 h-9 rounded-xl bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-600 transition-colors"
                              title={t('common.view')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCommentChoiceFile(file)}
                              className="w-9 h-9 rounded-xl bg-amber-50 hover:bg-amber-100 flex items-center justify-center text-amber-600 transition-colors"
                              title={t('projects.comment')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadFile(file)}
                              disabled={downloading === file.cloudinaryPublicId}
                              className="w-9 h-9 rounded-xl bg-green-power-50 hover:bg-green-power-100 flex items-center justify-center text-green-power-600 disabled:opacity-50 transition-colors"
                              title={t('common.download')}
                            >
                              {downloading === file.cloudinaryPublicId ? (
                                <div className="w-4 h-4 border-2 border-green-power-500 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {filesTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setFilesCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={filesCurrentPage === 1}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50"
                    >
                      {t('common.previous')}
                    </button>
                    <span className="px-3 py-1.5 text-sm text-gray-600">{filesCurrentPage} / {filesTotalPages}</span>
                    <button
                      type="button"
                      onClick={() => setFilesCurrentPage((p) => Math.min(filesTotalPages, p + 1))}
                      disabled={filesCurrentPage === filesTotalPages}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50"
                    >
                      {t('common.next')}
                    </button>
                  </div>
                )}
              </div>
            )}

        </div>
      </div>

      {/* Upload popup – open from top-right button, no inline upload on screen */}
      {canUpload && uploadPopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setUploadPopupOpen(false); clearSelectedFiles(); }}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{t('projects.uploadFile')}</h3>
              <button type="button" onClick={() => { setUploadPopupOpen(false); clearSelectedFiles(); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6">
              {uploadError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{uploadError}</p>
                </div>
              )}
              {uploadSuccess && !uploadError && (
                <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200">
                  <p className="text-sm text-green-700">{uploadSuccess}</p>
                </div>
              )}
              <div
                role="button"
                tabIndex={0}
                onClick={() => !uploading && fileInputRef.current?.click()}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) fileInputRef.current?.click(); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!uploading) setUploadDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setUploadDragOver(false); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setUploadDragOver(false); if (!uploading) handleDropFiles(Array.from(e.dataTransfer.files || [])); }}
                className={`flex flex-col items-center justify-center py-8 px-4 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  uploadDragOver ? 'border-green-power-500 bg-green-power-50' : 'border-green-power-300 bg-green-power-50/50'
                }`}
              >
                {uploading ? (
                  <>
                    <div className="h-10 w-10 border-2 border-green-power-200 border-t-green-power-600 rounded-full animate-spin" />
                    <p className="mt-3 text-sm text-gray-600">{t('projects.uploading')}</p>
                  </>
                ) : (
                  <>
                    <svg className="w-12 h-12 text-green-power-600" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="mt-2 text-sm font-medium text-gray-800">{t('projects.clickToUpload')}</p>
                    <p className="text-xs text-gray-500">{t('projects.fileTypesAndSize')} — {t('projects.maxFileSize')}</p>
                  </>
                )}
              </div>
              {selectedFiles.length > 0 && !uploading && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-medium text-gray-700">{t('projects.selectedFiles', { count: selectedFiles.length })}</p>
                  <div className="flex gap-2 flex-wrap">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="w-14 text-center">
                        {/\.(jpg|jpeg|png)$/i.test(file.name) ? (
                          <ImagePreviewThumb file={file} />
                        ) : (
                          <div className="w-14 h-14 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center"><span className="text-lg">📄</span></div>
                        )}
                        <p className="text-[10px] text-gray-600 truncate mt-0.5" title={file.name}>{file.name}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={confirmUpload} className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-xl hover:bg-green-power-700">
                      {t('projects.uploadFiles', { count: selectedFiles.length })}
                    </button>
                    <button type="button" onClick={() => { clearSelectedFiles(); setUploadPopupOpen(false); }} className="px-4 py-2 border border-gray-300 text-sm rounded-xl hover:bg-gray-50">
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat icon: choice popup – Comment or View all comments */}
      {commentChoiceFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setCommentChoiceFile(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">{commentChoiceFile.fileName}</h3>
            </div>
            <div className="p-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => { setCommentForFile(commentChoiceFile); setCommentSubject(''); setCommentMessage(''); setCommentChoiceFile(null); }}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {t('projects.comment')}
              </button>
              <button
                type="button"
                onClick={() => { setCommentListForFile(commentChoiceFile); setCommentChoiceFile(null); }}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                {t('projects.viewAllComments')}
              </button>
              <button
                type="button"
                onClick={() => setCommentChoiceFile(null)}
                className="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View all comments – larger popup with list of previous comments for this file */}
      {commentListForFile && (() => {
        const fileComments = customerMessagesList.filter((m) => m.filePath === commentListForFile.cloudinaryPublicId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setCommentListForFile(null)}>
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900">{t('projects.viewAllComments')} — {commentListForFile.fileName}</h3>
                <button type="button" onClick={() => setCommentListForFile(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                {fileComments.length === 0 ? (
                  <p className="text-gray-500 text-sm py-4">{t('projects.noCommentsYet')}</p>
                ) : (
                  <ul className="space-y-4">
                    {fileComments.map((m) => (
                      <li key={m.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                        {m.subject && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{m.subject}</p>}
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{m.message}</p>
                        <p className="text-xs text-gray-400 mt-2">{formatUploadedDate(m.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Per-file add-comment popup – opened from "Comment" in choice */}
      {commentForFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setCommentForFile(null); setCommentSubject(''); setCommentMessage(''); setCommentChoiceFile(null); setCommentListForFile(null); }}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                {t('projects.comment')} — {commentForFile.fileName}
              </h3>
              <button type="button" onClick={() => { setCommentForFile(null); setCommentSubject(''); setCommentMessage(''); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('projects.commentSubject')} <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={commentSubject}
                    onChange={(e) => setCommentSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 bg-white"
                    placeholder={t('projects.commentSubjectPlaceholder')}
                  />
                </div>
                <textarea
                  value={commentMessage}
                  onChange={(e) => setCommentMessage(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 resize-none bg-white"
                  placeholder={t('projects.messagePlaceholder')}
                  disabled={submittingMessage}
                  maxLength={500}
                />
                <p className="text-xs text-gray-500">{commentMessage.length}/500</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSubmitFileComment}
                    disabled={!commentSubject.trim() || !commentMessage.trim() || submittingMessage || commentMessage.length > 500}
                    className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submittingMessage ? t('common.sending') : t('common.sendMessage')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCommentForFile(null); setCommentSubject(''); setCommentMessage(''); }}
                    className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File preview modal (view before download) – thumbnail click or View button; prev/next like gallery */}
      {previewFile && (() => {
        const previewIndex = files.findIndex((f) => f.cloudinaryPublicId === previewFile.cloudinaryPublicId);
        const hasPrev = previewIndex > 0;
        const hasNext = previewIndex >= 0 && previewIndex < files.length - 1;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setPreviewFile(null)}
          >
            <button
              type="button"
              onClick={() => setPreviewFile(null)}
              className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
              aria-label={t('common.close')}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {hasPrev && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPreviewFile(files[previewIndex - 1]); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
                aria-label={t('common.previous')}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPreviewFile(files[previewIndex + 1]); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white hover:bg-white/10 rounded-lg transition-colors z-10"
                aria-label={t('common.next')}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            <div
              className="relative max-w-[95vw] max-h-[90vh] w-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              {isImagePreviewable(previewFile.fileName) ? (
                <img
                  src={getViewUrl(previewFile)}
                  alt={previewFile.fileName}
                  className="max-h-[90vh] w-auto object-contain rounded-lg"
                />
              ) : previewFile.fileName.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={getViewUrl(previewFile)}
                  title={previewFile.fileName}
                  className="w-full h-[90vh] max-w-4xl rounded-lg bg-white"
                />
              ) : (
                <iframe
                  src={getViewUrl(previewFile)}
                  title={previewFile.fileName}
                  className="w-full h-[90vh] max-w-4xl rounded-lg bg-white"
                />
              )}
              <p className="absolute bottom-0 left-0 right-0 py-2 text-center text-white text-sm bg-black/50 rounded-b-lg">
                {previewFile.fileName}
              </p>
            </div>
          </div>
        );
      })()}

      {/* File Upload Preview Modal */}
      <FileUploadPreviewModal
        isOpen={showUploadPreview}
        file={selectedFile}
        folderPath={folderPath}
        onConfirm={confirmUpload}
        onCancel={cancelUpload}
      />
    </div>
  );
}

export default function FolderViewPage() {
  return <FolderViewContent />;
}
