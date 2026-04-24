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
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { type CustomerMessage } from '@/lib/customerMessages';
import {
  groupMessagesByThread,
  sortThreadsNewestFirst,
  expandThreadsForFile,
} from '@/lib/customerMessageThreads';
import {
  PROJECT_FOLDER_STRUCTURE,
  isSignableDocumentsFolderPath,
  formatFolderName,
  isAdminOnlyFolderPath,
  isCustomFolderPath,
  isCustomerAllowedFolderPath,
  mergeDynamicSubfolders,
} from '@/lib/folderStructure';
import { markFileAsRead, isFileRead } from '@/lib/fileReadTracking';
import { getReportStatus, approveReport, ReportStatus } from '@/lib/reportApproval';
import { getGalleryImages } from '@/lib/galleryClient';
import { getAdminPanelBaseUrl } from '@/lib/adminPanelUrl';
import FileUploadPreviewModal from '@/components/FileUploadPreviewModal';
import SignDocumentModal from '@/components/SignDocumentModal';
import NativePdfIframe from '@/components/NativePdfIframe';
import { fileUrlFromFirestoreDoc, fileKeyFromFirestoreDoc } from '@/lib/fileDocFields';
import { toCustomerPortalMediaUrl } from '@/lib/adminPanelUrl';

const STORAGE_ENDPOINT = '/api/storage';
const FILES_QUERY_LIMIT = 100;

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

async function uploadProjectFile(file: File, folderPath: string, publicId?: string) {
  const formData = new FormData();
  formData.append('file', file);
  if (publicId) {
    formData.append('public_id', publicId);
  } else {
    formData.append('folder', folderPath);
  }

  const response = await fetch(`${STORAGE_ENDPOINT}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: string; fileName?: string };
    if (error.error === 'duplicate_file_name') {
      throw Object.assign(new Error('duplicate_file_name'), {
        code: 'DUPLICATE_FILE_NAME' as const,
        fileName: typeof error.fileName === 'string' ? error.fileName : '',
      });
    }
    throw new Error(typeof error.error === 'string' ? error.error : 'Upload failed');
  }

  return await response.json();
}

interface Project {
  id: string;
  name: string;
  projectNumber?: string;
  year?: number;
  customerId: string;
  folderDisplayNames?: Record<string, string>;
  customFolders?: string[];
  dynamicSubfolders?: Record<string, string[]>;
}

interface FileItem {
  fileName: string;
  fileUrl: string;
  fileKey: string;
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
  const rec = data as Record<string, unknown>;
  const fileName = data.fileName as string;
  const fileKey = fileKeyFromFirestoreDoc(rec) || '';
  const fileType = deriveFileType(fileName);

  const fileItem: FileItem = {
    fileName,
    fileUrl: fileUrlFromFirestoreDoc(rec),
    fileKey,
    folderPath,
    fileType,
    uploadedAt: data.uploadedAt?.toDate ? data.uploadedAt.toDate() : null,
    docId: docSnap.id, // Store Firestore document ID
  };

  if (projectId && customerId) {
    if (preloaded) {
      fileItem.isRead = preloaded.readFilePaths.has(fileKey);
      fileItem.reportStatus = preloaded.approvedFilePaths.has(fileKey)
        ? 'approved'
        : fileItem.isRead
          ? 'read'
          : 'unread';
    } else {
      try {
        fileItem.isRead = await isFileRead(projectId, customerId, fileKey);
      } catch (error) {
        console.warn('Error checking file read status, defaulting to unread:', error);
        fileItem.isRead = false;
      }
      try {
        fileItem.reportStatus = await getReportStatus(projectId, customerId, fileKey, fileItem.isRead);
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
  const [error, setError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  /** Fixed toast for file-comment send (upload popup uses uploadSuccess inline). */
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [uploadPopupOpen, setUploadPopupOpen] = useState(false);
  const [customerMessagesList, setCustomerMessagesList] = useState<CustomerMessage[]>([]);
  const [submittingMessage, setSubmittingMessage] = useState(false);
  const [commentChoiceFile, setCommentChoiceFile] = useState<FileItem | null>(null);
  const [commentForFile, setCommentForFile] = useState<FileItem | null>(null);
  const [commentListForFile, setCommentListForFile] = useState<FileItem | null>(null);
  /** Highlights the comment row just saved (also scrolls into view in history modal). */
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const [threadReplyDrafts, setThreadReplyDrafts] = useState<Record<string, string>>({});
  const [submittingThreadReplyRootId, setSubmittingThreadReplyRootId] = useState<string | null>(null);
  /** Which threads are expanded in "View all comments" modal (accordion). */
  const [expandedCommentThreads, setExpandedCommentThreads] = useState<Set<string>>(new Set());
  const [commentSubject, setCommentSubject] = useState('');
  const [commentMessage, setCommentMessage] = useState('');
  const [projectGalleryImages, setProjectGalleryImages] = useState<Array<{ id: string; url: string; category: string; title: string }>>([]);
  /** Batch-loaded read/approval sets to avoid N getDocs per file; null until loaded. */
  const [readApprovalPreloaded, setReadApprovalPreloaded] = useState<ReadApprovalPreloaded | null>(null);
  const readApprovalPreloadedRef = useRef<ReadApprovalPreloaded | null>(null);
  readApprovalPreloadedRef.current = readApprovalPreloaded;
  const [signingFile, setSigningFile] = useState<FileItem | null>(null);
  /** fileKey values that already have a stored report signature (cannot sign again). */
  const [signedFileKeys, setSignedFileKeys] = useState<Set<string>>(new Set());
  /** Bust browser/CDN cache for PDF viewer URL after in-place replace (same URL). */
  const [pdfCacheBustByFileKey, setPdfCacheBustByFileKey] = useState<Record<string, number>>({});

  const COMMENT_SUBJECT_OPTIONS = [
    { value: 'not_accepted', labelKey: 'projects.commentSubjectNotAccepted' },
    { value: 'correction_needed', labelKey: 'projects.commentSubjectCorrectionNeeded' },
    { value: 'question', labelKey: 'projects.commentSubjectQuestion' },
    { value: 'complaint', labelKey: 'projects.commentSubjectComplaint' },
  ] as const;
  const [filesCurrentPage, setFilesCurrentPage] = useState(1);
  const [filesItemsPerPage, setFilesItemsPerPage] = useState(10);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const commentHistoryEndRef = useRef<HTMLDivElement | null>(null);
  const currentFolderRef = useRef<string>('');
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projectId = params.id as string;
  const folderPath = Array.isArray(params.path) 
    ? params.path.join('/') 
    : (params.path ? String(params.path) : '');

  const canUpload = folderPath.startsWith('01_Customer_Uploads') || (isCustomFolderPath(folderPath) && project?.customFolders?.includes(folderPath));
  const isReportFolder = folderPath.startsWith('03_Reports');
  const isSignableDocumentsFolder = isSignableDocumentsFolderPath(folderPath);
  const isAdminOnlyFolder = isAdminOnlyFolderPath(folderPath);

  useEffect(() => {
    if (!projectId || !folderPath || !currentUser || !isSignableDocumentsFolder) {
      setSignedFileKeys(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await currentUser.getIdToken();
        const res = await fetch(
          `/api/report-signatures/signed-keys?projectId=${encodeURIComponent(projectId)}&folderPath=${encodeURIComponent(folderPath)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { signedFilePaths?: unknown };
        const paths = Array.isArray(data.signedFilePaths) ? data.signedFilePaths : [];
        const next = new Set<string>();
        for (const p of paths) {
          if (typeof p === 'string' && p) next.add(p);
        }
        if (!cancelled) setSignedFileKeys(next);
      } catch {
        if (!cancelled) setSignedFileKeys(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, folderPath, currentUser?.uid, isSignableDocumentsFolder]);
  const isCustomFolder = isCustomFolderPath(folderPath);
  const isAllowedFolder =
    !isAdminOnlyFolder && isCustomerAllowedFolderPath(folderPath, project ?? undefined);

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

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const stepPreviewFile = useCallback(
    (delta: -1 | 1) => {
      setPreviewFile((current) => {
        if (!current) return current;
        const idx = files.findIndex((f) => f.fileKey === current.fileKey);
        if (idx < 0) return current;
        const nextIdx = idx + delta;
        if (nextIdx < 0 || nextIdx >= files.length) return current;
        return files[nextIdx];
      });
    },
    [files]
  );

  // Allow keyboard navigation in file preview (same behavior for images and documents).
  useEffect(() => {
    if (!previewFile) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepPreviewFile(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepPreviewFile(1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPreviewFile(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewFile, stepPreviewFile]);

  // After sending a comment, history modal opens — scroll newest entry into view
  useEffect(() => {
    if (!commentListForFile) return;
    const id = window.setTimeout(() => {
      commentHistoryEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 150);
    return () => clearTimeout(id);
  }, [commentListForFile, highlightCommentId, customerMessagesList.length, expandedCommentThreads]);

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

  // Safeguard: prevent infinite loading if listener never fires
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading((prev) => (prev ? false : prev));
    }, 15000);
    return () => clearTimeout(t);
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

      const mergedStructure = mergeDynamicSubfolders(
        PROJECT_FOLDER_STRUCTURE,
        project.dynamicSubfolders
      );
      const folderPaths = mergedStructure.reduce<string[]>((acc, folder) => {
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
          const fk = fileKeyFromFirestoreDoc(data as Record<string, unknown>) || '';
          if (readFilePaths.has(fk)) return;

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
    if (!currentUser?.uid || !projectId || !db) return;
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
    const uid = currentUser.uid;

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
          where('uploadedBy', '==', uid),
          orderBy('uploadedAt', 'desc'),
          limit(FILES_QUERY_LIMIT)
        );
      } catch (indexError) {
        // Fallback: query without orderBy if index doesn't exist
        console.warn('Index missing for orderBy, using simple query:', indexError);
        filesQuery = query(
          filesCollection,
          where('uploadedBy', '==', uid),
          limit(FILES_QUERY_LIMIT)
        );
      }
    } else {
      filesQuery = query(filesCollection, orderBy('uploadedAt', 'desc'), limit(FILES_QUERY_LIMIT));
    }

    const unsubscribe = onSnapshot(
      filesQuery,
      async (snapshot) => {
        const preloaded = readApprovalPreloadedRef.current ?? undefined;
        const list = await Promise.all(
          snapshot.docs.map((docSnap) =>
            mapDocToFileItem(docSnap, folderPath, projectId, uid, preloaded)
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
            where('uploadedBy', '==', uid),
            limit(FILES_QUERY_LIMIT)
          );
          const retryUnsubscribe = onSnapshot(
            simpleQuery,
            async (snapshot) => {
              const preloaded = readApprovalPreloadedRef.current ?? undefined;
              const list = await Promise.all(
                snapshot.docs.map((docSnap) =>
                  mapDocToFileItem(docSnap, folderPath, projectId, uid, preloaded)
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
  }, [projectId, folderPath, currentUser?.uid, t, isAdminOnlyFolder, isCustomFolder]);

  // Reset to page 1 when folder or files change
  useEffect(() => {
    setFilesCurrentPage(1);
  }, [folderPath, files.length]);

  const filesTotalPages = Math.max(1, Math.ceil(files.length / filesItemsPerPage));
  const filesStart = files.length === 0 ? 0 : (filesCurrentPage - 1) * filesItemsPerPage + 1;
  const filesEnd = Math.min(filesCurrentPage * filesItemsPerPage, files.length);
  const paginatedFiles = files.slice((filesCurrentPage - 1) * filesItemsPerPage, filesCurrentPage * filesItemsPerPage);

  async function handleMarkAsRead(file: FileItem) {
    if (!currentUser || !project || markingAsRead === file.fileKey) return;
    
    setMarkingAsRead(file.fileKey);
    try {
      // Mark file as read
      await markFileAsRead(projectId, currentUser.uid, file.fileKey);
      // Keep batch cache in sync so next snapshot uses it
      setReadApprovalPreloaded((prev) => {
        if (!prev) return prev;
        const next = new Set(prev.readFilePaths);
        next.add(file.fileKey);
        return { readFilePaths: next, approvedFilePaths: prev.approvedFilePaths };
      });
      file.isRead = true;
      file.reportStatus = await getReportStatus(projectId, currentUser.uid, file.fileKey, true);
      setFiles((prev) => prev.map((f) => (f.fileKey === file.fileKey ? file : f)));
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
              filePath: file.fileKey,
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
    
    setApproving(file.fileKey);
    try {
      // Mark file as read when approving
      await markFileAsRead(projectId, currentUser.uid, file.fileKey);
      
      // Approve the file (this will update the pending document to approved)
      await approveReport(projectId, currentUser.uid, file.fileKey);
      // Keep batch cache in sync
      setReadApprovalPreloaded((prev) => {
        if (!prev) return prev;
        const r = new Set(prev.readFilePaths);
        r.add(file.fileKey);
        const a = new Set(prev.approvedFilePaths);
        a.add(file.fileKey);
        return { readFilePaths: r, approvedFilePaths: a };
      });
      file.reportStatus = 'approved';
      file.isRead = true;
      setFiles((prev) => prev.map((f) => (f.fileKey === file.fileKey ? file : f)));
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
              filePath: file.fileKey,
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
        // Storage key without file extension (extension comes from the uploaded file)
        const publicId = `${folderPathFull}/${sanitizedBaseName}`;
        const result = await uploadProjectFile(file, folderPathFull, publicId);
        
        const segments = getFolderSegments(folderPath);
        const filesCollection = getProjectFolderRef(projectId, segments);
        const docId = result.public_id.split('/').pop() || result.public_id;
        
        await setDoc(doc(filesCollection, docId), {
          fileName: sanitizedFileName,
          fileKey: result.public_id,
          fileUrl: result.secure_url,
          storageProvider: 'vps',
          fileType: deriveFileType(sanitizedFileName),
          uploadedAt: serverTimestamp(),
          uploadedBy: currentUser.uid,
          ...(typeof result.storagePath === 'string' ? { storagePath: result.storagePath } : {}),
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
    } catch (error: unknown) {
      console.error('Error uploading files:', error);
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'DUPLICATE_FILE_NAME'
      ) {
        const fn =
          'fileName' in error && typeof (error as { fileName?: string }).fileName === 'string'
            ? (error as { fileName: string }).fileName
            : '';
        setUploadError(t('projects.duplicateFileName', { name: fn }));
      } else {
        const msg = error instanceof Error ? error.message : String(error);
        setUploadError(t('projects.fileUploadFailed', { error: msg }));
      }
    } finally {
      setUploading(false);
    }
  }

  // Customer messages (comments): file-specific comments (folder-level general chat UI removed)
  const customerMessagesRef = db ? collection(db, 'customerMessages') : null;

  useEffect(() => {
    if (!customerMessagesRef || !projectId || !folderPath || !currentUser) {
      setCustomerMessagesList([]);
      return;
    }
    // No orderBy: avoids composite-index failures (would yield empty list). Sort client-side.
    const q = query(
      customerMessagesRef,
      where('projectId', '==', projectId),
      where('folderPath', '==', folderPath),
      where('customerId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: CustomerMessage[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          projectId: (data.projectId as string) || '',
          folderPath: (data.folderPath as string) || '',
          customerId: (data.customerId as string) || '',
          message: (data.message as string) || '',
          subject: data.subject as string | undefined,
          fileName: data.fileName as string | undefined,
          filePath: data.filePath as string | undefined,
          status: (data.status as CustomerMessage['status']) || 'unread',
          messageType: (data.messageType as CustomerMessage['messageType']) || 'general',
          createdAt: data.createdAt?.toDate?.() ?? null,
          authorType: (data.authorType as CustomerMessage['authorType']) || 'customer',
          parentMessageId: (data.parentMessageId as string | undefined) ?? null,
          threadRootId: (data.threadRootId as string | undefined) ?? null,
        };
      });
      list.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
      setCustomerMessagesList(list);
    }, (err) => {
      console.error('Customer messages listener error:', err);
      setCustomerMessagesList([]);
    });
    return () => unsub();
  }, [projectId, folderPath, currentUser?.uid]);

  async function handleSubmitFileComment() {
    if (!commentForFile || !commentSubject.trim() || !commentMessage.trim() || !project || !currentUser || !customerMessagesRef) {
      return;
    }
    const fileForComment = commentForFile;
    const subjectTrim = commentSubject.trim();
    const messageTrim = commentMessage.trim();
    setSubmittingMessage(true);
    try {
      const newRef = doc(collection(db!, 'customerMessages'));
      await setDoc(newRef, {
        projectId,
        folderPath,
        customerId: currentUser.uid,
        message: messageTrim,
        subject: subjectTrim,
        fileName: fileForComment.fileName,
        filePath: fileForComment.fileKey,
        status: 'unread',
        messageType: 'file_comment',
        authorType: 'customer',
        threadRootId: newRef.id,
        createdAt: serverTimestamp(),
      });
      const optimistic: CustomerMessage = {
        id: newRef.id,
        projectId,
        folderPath,
        customerId: currentUser.uid,
        message: messageTrim,
        subject: subjectTrim,
        fileName: fileForComment.fileName,
        filePath: fileForComment.fileKey,
        status: 'unread',
        messageType: 'file_comment',
        authorType: 'customer',
        parentMessageId: null,
        threadRootId: newRef.id,
        createdAt: new Date(),
      };
      setCustomerMessagesList((prev) => {
        if (prev.some((m) => m.id === newRef.id)) return prev;
        return [...prev, optimistic].sort(
          (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
        );
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
              message: messageTrim,
              subject: subjectTrim,
              fileName: fileForComment.fileName,
              filePath: fileForComment.fileKey,
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
      setHighlightCommentId(newRef.id);
      setCommentListForFile(fileForComment);
      setExpandedCommentThreads(new Set([newRef.id]));
      setToast({ message: t('projects.messageSentSuccess'), type: 'success' });
    } catch (error: any) {
      console.error('Error submitting file comment:', error);
      setToast({ message: t('projects.messageSendFailed'), type: 'error' });
    } finally {
      setSubmittingMessage(false);
    }
  }

  async function handleCustomerThreadReply(thread: CustomerMessage[]) {
    if (!customerMessagesRef || !project || !currentUser || thread.length === 0) return;
    const root = thread[0];
    const last = thread[thread.length - 1];
    const rootId = root.id;
    const text = (threadReplyDrafts[rootId] || '').trim();
    if (!text || text.length > 500) return;
    setSubmittingThreadReplyRootId(rootId);
    try {
      const threadRootId = root.threadRootId || root.id;
      await addDoc(customerMessagesRef, {
        projectId,
        folderPath,
        customerId: currentUser.uid,
        message: text,
        authorType: 'customer',
        parentMessageId: last.id,
        threadRootId,
        fileName: root.fileName,
        filePath: root.filePath,
        messageType: 'file_comment',
        status: 'unread',
        createdAt: serverTimestamp(),
      });
      setThreadReplyDrafts((prev) => ({ ...prev, [rootId]: '' }));
      setToast({ message: t('projects.replySent'), type: 'success' });
    } catch (error) {
      console.error('Error sending thread reply:', error);
      setToast({ message: t('projects.messageSendFailed'), type: 'error' });
    } finally {
      setSubmittingThreadReplyRootId(null);
    }
  }

  function toggleCommentThread(rootId: string) {
    setExpandedCommentThreads((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }

  function cancelUpload() {
    setShowUploadPreview(false);
    setSelectedFiles([]);
    setSelectedFile(null);
  }

  function getViewUrl(file: FileItem): string {
    const lower = file.fileName.toLowerCase();
    let url: string;
    const resolved = toCustomerPortalMediaUrl(file.fileUrl);
    if (lower.endsWith('.pdf') && resolved.includes('/image/upload/')) {
      url = resolved.replace('/image/upload/', '/raw/upload/');
    } else {
      url = resolved;
    }
    const bust = pdfCacheBustByFileKey[file.fileKey];
    if (bust != null) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}_gp=${bust}`;
    }
    return url;
  }

  function isImagePreviewable(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].some((ext) => lower.endsWith(ext));
  }

  /**
   * Mark read + either open the sign flow (unsigned PDF in a signable folder) or the in-portal preview.
   * Thumbnail and pen both use `preferSignFlowForUnsignedPdf` so tapping the PDF matches the signature control.
   */
  async function handleViewFile(
    file: FileItem,
    opts?: { preferSignFlowForUnsignedPdf?: boolean }
  ) {
    if (!currentUser || !project) return;

    try {
      await markFileAsRead(projectId, currentUser.uid, file.fileKey);
      setReadApprovalPreloaded((prev) => {
        if (!prev) return prev;
        const next = new Set(prev.readFilePaths);
        next.add(file.fileKey);
        return { readFilePaths: next, approvedFilePaths: prev.approvedFilePaths };
      });
      const reportStatus = await getReportStatus(projectId, currentUser.uid, file.fileKey, true);
      setFiles((prev) =>
        prev.map((f) =>
          f.fileKey === file.fileKey ? { ...f, isRead: true, reportStatus } : f
        )
      );
      // Use updated file for preview/open so modal shows correct state
      file = { ...file, isRead: true, reportStatus };
    } catch (err) {
      console.error('Error marking file as read on view:', err);
    }

    const openSignFlow =
      opts?.preferSignFlowForUnsignedPdf === true &&
      isSignableDocumentsFolder &&
      file.fileType === 'pdf' &&
      !signedFileKeys.has(file.fileKey);

    if (openSignFlow) {
      setSigningFile(file);
      return;
    }

    // Open in-portal viewer for all other file types (no new tab, URL not revealed)
    setPreviewFile(file);
  }

  async function handleDownloadFile(file: FileItem) {
    if (!currentUser || !project || downloading === file.fileKey) return;
    
    setDownloading(file.fileKey);
    
    try {
      await markFileAsRead(projectId, currentUser.uid, file.fileKey);
      setReadApprovalPreloaded((prev) => {
        if (!prev) return prev;
        const next = new Set(prev.readFilePaths);
        next.add(file.fileKey);
        return { readFilePaths: next, approvedFilePaths: prev.approvedFilePaths };
      });
      file.isRead = true;
      file.reportStatus = await getReportStatus(projectId, currentUser.uid, file.fileKey, true);
      setFiles((prev) => prev.map((f) => (f.fileKey === file.fileKey ? file : f)));
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
      let downloadUrl = toCustomerPortalMediaUrl(file.fileUrl);
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
          const originalBase = toCustomerPortalMediaUrl(file.fileUrl);
          const originalUrl = originalBase + (originalBase.includes('?') ? '&' : '?') + 'fl_attachment';
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
          let fallbackUrl = toCustomerPortalMediaUrl(file.fileUrl).replace('/image/upload/', '/raw/upload/');
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

  const folderNotAllowed =
    !project ||
    isAdminOnlyFolderPath(folderPath) ||
    !isCustomerAllowedFolderPath(folderPath, project);
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
                {project.projectNumber?.trim() && (
                  <p className="mt-1 text-sm text-gray-600 font-mono tabular-nums">
                    {t('dashboard.projectNumber')}: {project.projectNumber.trim()}
                  </p>
                )}
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
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
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 mb-6">
              {paginatedFiles.map((file) => {
                const status = file.reportStatus || 'unread';
                const isImage = file.fileType === 'image';
                const isPdfReport = isSignableDocumentsFolder && file.fileType === 'pdf';
                const isSignedReport = isPdfReport && signedFileKeys.has(file.fileKey);
                const signIconTitle = isSignedReport
                  ? t('projects.signAlreadySigned')
                  : t('projects.signReport');
                return (
                  <div
                    key={file.fileKey}
                    className="group rounded-2xl border-2 border-white/70 bg-white/95 shadow-xl overflow-hidden hover:shadow-2xl hover:border-green-power-200/70 transition-all duration-300 hover:-translate-y-0.5"
                    style={{ boxShadow: '0 10px 40px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.5)' }}
                  >
                        {/* Thumbnail – click to open file */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => void handleViewFile(file, { preferSignFlowForUnsignedPdf: true })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              void handleViewFile(file, { preferSignFlowForUnsignedPdf: true });
                            }
                          }}
                          className="aspect-[4/3] bg-gray-50 relative overflow-hidden cursor-pointer"
                        >
                          {isImage ? (
                            <img
                              src={toCustomerPortalMediaUrl(file.fileUrl)}
                              alt=""
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                              <span className="text-5xl opacity-80">📄</span>
                            </div>
                          )}
                          {isPdfReport && (
                            <span
                              className={`absolute top-2 left-2 z-10 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shadow-sm max-w-[calc(100%-5rem)] truncate ${
                                isSignedReport
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white/95 text-gray-800 border border-gray-200/90'
                              }`}
                              title={
                                isSignedReport
                                  ? t('projects.signAlreadySigned')
                                  : t('projects.reportUnsignedHint')
                              }
                            >
                              {isSignedReport ? translateStatus('signed', t) : translateStatus('unsigned', t)}
                            </span>
                          )}
                          <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end max-w-[55%]">
                            {!canUpload && status === 'approved' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-600 text-white shadow-sm">
                                {translateStatus('approved', t)}
                              </span>
                            )}
                            {!file.isRead && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500 text-white shadow-sm">
                                {translateStatus('unread', t)}
                              </span>
                            )}
                          </div>
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
                            {!file.isRead && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkAsRead(file);
                                }}
                                disabled={markingAsRead === file.fileKey}
                                className="w-9 h-9 rounded-xl bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-600 disabled:opacity-50 transition-colors"
                                title={t('projects.markRead')}
                                aria-label={t('projects.markRead')}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                            )}
                            {!canUpload && isSignableDocumentsFolder && file.fileType === 'pdf' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!signedFileKeys.has(file.fileKey)) {
                                    void handleViewFile(file, { preferSignFlowForUnsignedPdf: true });
                                  }
                                }}
                                disabled={signedFileKeys.has(file.fileKey)}
                                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                                  signedFileKeys.has(file.fileKey)
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600'
                                }`}
                                title={signIconTitle}
                                aria-label={signIconTitle}
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M16.862 3.487a2.25 2.25 0 0 1 3.182 3.182L9.75 16.963 6 18l1.037-3.75 9.825-10.763Z" />
                                  <path d="M5 21h14" />
                                </svg>
                              </button>
                            )}
                            {!canUpload && status !== 'approved' && !(isSignableDocumentsFolder && file.fileType === 'pdf') && (
                              <button
                                onClick={() => handleApproveReport(file)}
                                disabled={approving === file.fileKey}
                                className="w-9 h-9 rounded-xl bg-green-power-50 hover:bg-green-power-100 flex items-center justify-center text-green-power-600 disabled:opacity-50 transition-colors"
                                title={t('projects.approve')}
                                aria-label={t('projects.approve')}
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setCommentChoiceFile(file)}
                              className="w-9 h-9 rounded-xl bg-amber-50 hover:bg-amber-100 flex items-center justify-center text-amber-600 transition-colors"
                              title={t('projects.comment')}
                              aria-label={t('projects.comment')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadFile(file)}
                              disabled={downloading === file.fileKey}
                              className="w-9 h-9 rounded-xl bg-green-power-50 hover:bg-green-power-100 flex items-center justify-center text-green-power-600 disabled:opacity-50 transition-colors"
                              title={t('common.download')}
                              aria-label={t('common.download')}
                            >
                              {downloading === file.fileKey ? (
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
            </>
            )}

        </div>
      </div>

      {signingFile && currentUser && (
        <SignDocumentModal
          file={signingFile}
          pdfSrc={getViewUrl(signingFile)}
          projectId={projectId}
          folderPath={folderPath}
          customerId={currentUser.uid}
          onClose={() => setSigningFile(null)}
          onReportProblem={() => {
            const f = signingFile;
            if (f) {
              setCommentForFile(f);
              setCommentSubject('');
              setCommentMessage('');
            }
          }}
          onSuccess={async (result) => {
            const signedFile = signingFile;
            setSignedFileKeys((prev) => {
              const next = new Set(prev);
              next.add(signedFile.fileKey);
              return next;
            });
            if (result.stamped) {
              setPdfCacheBustByFileKey((prev) => ({
                ...prev,
                [signedFile.fileKey]: Date.now(),
              }));
              setToast({ message: t('projects.signSuccess'), type: 'success' });
            } else {
              setToast({ message: t('projects.signStampPartial'), type: 'warning' });
            }
            if (signedFile && currentUser && !signedFile.isRead) {
              try {
                await markFileAsRead(projectId, currentUser.uid, signedFile.fileKey);
                setReadApprovalPreloaded((prev) => {
                  if (!prev) return prev;
                  const next = new Set(prev.readFilePaths);
                  next.add(signedFile.fileKey);
                  return { readFilePaths: next, approvedFilePaths: prev.approvedFilePaths };
                });
                const reportStatus = await getReportStatus(
                  projectId,
                  currentUser.uid,
                  signedFile.fileKey,
                  true
                );
                setFiles((prev) =>
                  prev.map((f) =>
                    f.fileKey === signedFile.fileKey ? { ...f, isRead: true, reportStatus } : f
                  )
                );
                try {
                  const adminPanelBaseUrl = getAdminPanelBaseUrl();
                  if (adminPanelBaseUrl && project) {
                    await fetch(`${adminPanelBaseUrl}/api/notifications/file-activity`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        eventType: 'read',
                        projectId,
                        projectName: project.name,
                        customerId: currentUser.uid,
                        folderPath,
                        filePath: signedFile.fileKey,
                        fileName: signedFile.fileName,
                      }),
                    });
                  }
                } catch (notifyError) {
                  console.error('Error triggering file read notification after sign:', notifyError);
                }
              } catch (e) {
                console.error('Error marking file as read after sign:', e);
              }
            }
          }}
        />
      )}

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
                onClick={() => {
                  setCommentListForFile(commentChoiceFile);
                  setCommentChoiceFile(null);
                  setHighlightCommentId(null);
                  setExpandedCommentThreads(new Set());
                }}
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
        const fileComments = expandThreadsForFile(customerMessagesList, {
          fileKey: commentListForFile.fileKey,
          fileName: commentListForFile.fileName,
        });
        const threads = sortThreadsNewestFirst(groupMessagesByThread(fileComments));
        const closeHistory = () => {
          setCommentListForFile(null);
          setHighlightCommentId(null);
          setThreadReplyDrafts({});
          setExpandedCommentThreads(new Set());
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeHistory}>
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-2xl max-h-[min(90vh,720px)] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0 gap-2">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 leading-tight">
                  {t('projects.viewAllComments')} — <span className="break-all">{commentListForFile.fileName}</span>
                </h3>
                <button type="button" onClick={closeHistory} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 px-4 sm:px-6 py-3 overflow-y-auto overscroll-contain">
                {fileComments.length === 0 ? (
                  <p className="text-gray-500 text-sm py-4">{t('projects.noCommentsYet')}</p>
                ) : (
                  <div className="space-y-2">
                    {threads.map((thread) => {
                      const root = thread[0];
                      const replies = thread.slice(1);
                      const rootId = root.id;
                      const draft = threadReplyDrafts[rootId] || '';
                      const isOpen = expandedCommentThreads.has(rootId);
                      return (
                        <div key={rootId} className="rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
                          <button
                            type="button"
                            onClick={() => toggleCommentThread(rootId)}
                            className="w-full flex items-start gap-2 sm:gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                            aria-expanded={isOpen}
                          >
                            <span className="text-gray-500 shrink-0 mt-0.5" aria-hidden>
                              {isOpen ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                {t('projects.mainComment')}
                              </p>
                              {root.subject && (
                                <p className="text-xs font-medium text-gray-700 truncate mt-0.5">{root.subject}</p>
                              )}
                              <p className="text-sm text-gray-900 line-clamp-2 mt-1">{root.message}</p>
                              <p className="text-xs text-gray-400 mt-1">{formatUploadedDate(root.createdAt)}</p>
                              {replies.length > 0 && (
                                <p className="text-xs text-green-power-700 font-medium mt-1">
                                  {replies.length === 1
                                    ? t('projects.threadReplyCountOne')
                                    : t('projects.threadReplyCountMany', { count: replies.length })}
                                </p>
                              )}
                            </div>
                          </button>

                          {isOpen && (
                            <div className="border-t border-gray-100 bg-gray-50/90 px-3 py-3 space-y-3">
                              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white overflow-hidden">
                                {thread.map((m) => {
                                  const isRoot = m.id === thread[0].id;
                                  return (
                                    <div
                                      key={m.id}
                                      className={`p-3 ${
                                        m.parentMessageId ? 'pl-4 sm:pl-6 bg-gray-50/90 border-l-4 border-l-green-power-400' : ''
                                      } ${
                                        highlightCommentId === m.id
                                          ? 'ring-2 ring-inset ring-green-power-400 bg-green-power-50/50'
                                          : ''
                                      }`}
                                    >
                                      {highlightCommentId === m.id && (
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-green-800 mb-2">
                                          {t('projects.commentJustAdded')}
                                        </p>
                                      )}
                                      <p className="text-[11px] font-semibold text-gray-600 mb-1">
                                        {m.authorType === 'admin' ? t('projects.replyFromTeam') : t('projects.you')}
                                      </p>
                                      {isRoot && m.subject && (
                                        <p className="text-xs font-medium text-gray-600 mb-1">{m.subject}</p>
                                      )}
                                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{m.message}</p>
                                      <p className="text-xs text-gray-400 mt-2">{formatUploadedDate(m.createdAt)}</p>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="rounded-lg border border-gray-200 bg-white p-3">
                                <label className="text-xs font-medium text-gray-700 mb-1 block" htmlFor={`thread-reply-${rootId}`}>
                                  {t('projects.yourReply')}
                                </label>
                                <textarea
                                  id={`thread-reply-${rootId}`}
                                  value={draft}
                                  onChange={(e) => setThreadReplyDrafts((prev) => ({ ...prev, [rootId]: e.target.value }))}
                                  rows={3}
                                  maxLength={500}
                                  disabled={submittingThreadReplyRootId === rootId}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 resize-y min-h-[4rem] max-h-32 bg-white disabled:opacity-50"
                                  placeholder={t('projects.yourReplyPlaceholder')}
                                />
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <span className="text-xs text-gray-400">{draft.length}/500</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCustomerThreadReply(thread)}
                                    disabled={!draft.trim() || submittingThreadReplyRootId === rootId || draft.length > 500}
                                    className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {submittingThreadReplyRootId === rootId ? t('common.sending') : t('projects.sendReply')}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div ref={commentHistoryEndRef} aria-hidden className="h-px w-full shrink-0" />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Per-file add-comment popup – opened from "Comment" in choice */}
      {commentForFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setCommentForFile(null); setCommentSubject(''); setCommentMessage(''); setCommentChoiceFile(null); setCommentListForFile(null); setHighlightCommentId(null); setExpandedCommentThreads(new Set()); }}>
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
        const previewIndex = files.findIndex((f) => f.fileKey === previewFile.fileKey);
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
                onClick={(e) => { e.stopPropagation(); stepPreviewFile(-1); }}
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
                onClick={(e) => { e.stopPropagation(); stepPreviewFile(1); }}
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
                <NativePdfIframe
                  src={getViewUrl(previewFile)}
                  title={previewFile.fileName}
                  className="h-[90vh] min-h-[320px] w-full max-w-4xl rounded-lg"
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

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[100] flex max-w-md w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-3 shadow-lg ${
            toast.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-900'
              : toast.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-red-200 bg-red-50 text-red-900'
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.type === 'success' ? (
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </span>
          ) : toast.type === 'warning' ? (
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </span>
          ) : (
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <p className="text-sm font-medium leading-snug">{toast.message}</p>
        </div>
      )}
    </div>
  );
}

export default function FolderViewPage() {
  return <FolderViewContent />;
}
