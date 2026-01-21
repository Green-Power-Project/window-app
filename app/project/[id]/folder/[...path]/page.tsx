'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import CustomerLayout from '@/components/CustomerLayout';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
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
  CollectionReference,
  DocumentReference,
} from 'firebase/firestore';
import { PROJECT_FOLDER_STRUCTURE, formatFolderName } from '@/lib/folderStructure';
import { markFileAsRead, isFileRead } from '@/lib/fileReadTracking';
import { getReportStatus, approveReport, isReportFile, ReportStatus } from '@/lib/reportApproval';

const CLOUDINARY_ENDPOINT = '/api/cloudinary';

function getFolderSegments(folderPath: string): string[] {
  return folderPath.split('/').filter(Boolean);
}

function getProjectFolderRef(projectId: string, folderSegments: string[]) {
  if (folderSegments.length === 0) {
    throw new Error('Folder segments must not be empty');
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
}

interface FileItem {
  fileName: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  folderPath: string;
  fileType: string;
  uploadedAt: Date | null;
  reportStatus?: ReportStatus;
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
  };

  // Load report status if it's a report file
  if (isReportFile(folderPath) && fileType === 'pdf' && projectId && customerId) {
    const isRead = await isFileRead(projectId, customerId, cloudinaryPublicId);
    fileItem.reportStatus = await getReportStatus(projectId, customerId, cloudinaryPublicId, isRead);
  }

  return fileItem;
}

function FolderViewContent() {
  const params = useParams();
  const { currentUser } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const currentFolderRef = useRef<string>('');
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projectId = params.id as string;
  const folderPath = Array.isArray(params.path) 
    ? params.path.join('/') 
    : (params.path ? String(params.path) : '');

  const canUpload = folderPath.startsWith('01_Customer_Uploads');
  const isReportFolder = folderPath.startsWith('03_Reports');
  
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
          setError('Project not found');
          setLoading(false);
          return;
        }

        const projectData = { id: projectDoc.id, ...projectDoc.data() } as Project;

        if (projectData.customerId !== currentUser.uid) {
          setError('You do not have access to this project');
          setLoading(false);
          return;
        }

        setProject(projectData);
        setError('');
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to project:', error);
        setError('Failed to load project');
        setLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => {
      projectUnsubscribe();
    };
  }, [currentUser, projectId]);

  // Load unread files function - defined early so it can be used in useEffect hooks
  const loadUnreadFiles = useCallback(async () => {
    if (!project || !currentUser) return;
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
      setError('Failed to load unread files');
    } finally {
      setLoading(false);
    }
  }, [project, currentUser, projectId]);

  useEffect(() => {
    if (!project || !currentUser) return;
    if (!folderPath) {
      setFiles([]);
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
  }, [project, folderPath, currentUser, projectId]);

  async function handleFileOpen(file: FileItem) {
    if (!currentUser || !project) return;
    
    try {
      // Mark file as read
      await markFileAsRead(projectId, currentUser.uid, file.cloudinaryPublicId);
      
      // Update report status if it's a report
        if (file.reportStatus && isReportFile(file.folderPath)) {
          file.reportStatus = await getReportStatus(projectId, currentUser.uid, file.cloudinaryPublicId, true);
          // Update the file in the list
          setFiles(files.map(f => f.cloudinaryPublicId === file.cloudinaryPublicId ? file : f));
      }
      
    } catch (error) {
      console.error('Error marking file as read:', error);
      // Don't block file opening if tracking fails
    }
  }

  async function handleApproveReport(file: FileItem) {
    if (!currentUser || !project) return;
    
    setApproving(file.cloudinaryPublicId);
    try {
      await approveReport(projectId, currentUser.uid, file.cloudinaryPublicId);
      
      // Update file status
      file.reportStatus = 'approved';
      setFiles(files.map(f => f.cloudinaryPublicId === file.cloudinaryPublicId ? file : f));
    } catch (error) {
      console.error('Error approving report:', error);
      alert('Failed to approve report. Please try again.');
    } finally {
      setApproving(null);
    }
  }

  function validateFile(file: File): string | null {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const fileType = file.type.toLowerCase();
    
    if (!allowedTypes.includes(fileType)) {
      return 'Only PDF, JPG, and PNG files are allowed.';
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return 'File size must be less than 5 MB.';
    }

    return null;
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !project || !folderPath) return;

    setUploadError('');
    setUploadSuccess('');
    
    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setUploading(true);
    try {
      const fileExtension = file.name.split('.').pop();
      const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      const sanitizedBaseName = fileNameWithoutExt
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '');
      const sanitizedFileName = `${sanitizedBaseName}.${fileExtension}`;
      const folderPathFull = `projects/${projectId}/${folderPath}`;
      // Remove extension from public_id (Cloudinary will add it back)
      const publicId = `${folderPathFull}/${sanitizedBaseName}`;
      const result = await uploadCloudinaryFile(file, folderPathFull, publicId);
      e.target.value = '';
      
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
      
      // Clear any previous errors
      setUploadError('');
      setUploadSuccess(`${sanitizedFileName} uploaded successfully.`);
      
      // Files should appear automatically via the real-time listener
    } catch (error: any) {
      console.error('Error uploading file:', error);
      setUploadError(`Failed to upload file: ${error?.message || 'Please try again.'}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownloadFile(file: FileItem) {
    if (!currentUser || !project || downloading === file.cloudinaryPublicId) return;
    
    setDownloading(file.cloudinaryPublicId);
    
    try {
      // Mark file as read when downloading
      await markFileAsRead(projectId, currentUser.uid, file.cloudinaryPublicId);
      
      // Update report status if it's a report
      if (file.reportStatus && isReportFile(file.folderPath)) {
        file.reportStatus = await getReportStatus(projectId, currentUser.uid, file.cloudinaryPublicId, true);
        // Update the file in the list
        setFiles(files.map(f => f.cloudinaryPublicId === file.cloudinaryPublicId ? file : f));
      }
      
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
      
      alert(`Failed to download file: ${error.message || 'Please try again.'}`);
    } finally {
      setDownloading(null);
    }
  }

  function formatUploadedDate(date: Date | null): string {
    if (!date) return 'Pending';
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
      <CustomerLayout title="Loading...">
        <div className="px-8 py-8">
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <div className="inline-block h-8 w-8 border-3 border-green-power-200 border-t-green-power-600 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-600 font-medium">Loading...</p>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  if (error || !project) {
    return (
      <CustomerLayout title="Error">
        <div className="px-8 py-8">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm mb-4 rounded">
              {error || 'Project not found'}
            </div>
            <Link
              href="/dashboard"
              className="inline-block text-sm text-green-power-600 hover:text-green-power-700 font-medium"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  // Build full folder path display (parent folder > subfolder)
  const getFullFolderPath = () => {
    const pathParts = folderPath.split('/').filter(Boolean);
    if (pathParts.length > 1) {
      // Has parent folder and subfolder
      const parentFolder = PROJECT_FOLDER_STRUCTURE.find(f => f.path === pathParts[0]);
      const subfolderName = formatFolderName(pathParts[pathParts.length - 1]);
      if (parentFolder) {
        const parentName = formatFolderName(parentFolder.name);
        return `${parentName} > ${subfolderName}`;
      }
    }
    return formatFolderName(folderName);
  };

  const fullFolderPath = getFullFolderPath();
  const pageTitle = `${project.name} - ${fullFolderPath}`;

  return (
    <CustomerLayout title={pageTitle}>
      <div className="px-6 sm:px-8 py-6 sm:py-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center text-sm text-gray-600 hover:text-green-power-700 transition-colors mb-4 group"
          >
            <svg className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to {project.name}
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
                  {files.length} {files.length === 1 ? 'file' : 'files'}
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
                  <h3 className="text-base font-semibold text-gray-900">Upload File</h3>
                  <p className="text-xs text-gray-600">PDF, JPG, PNG (max 5 MB)</p>
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
              <label className="block">
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-green-power-400 hover:bg-green-power-50/50 transition-all duration-200 cursor-pointer">
                  <div className="space-y-2 text-center">
                    {uploading ? (
                      <>
                        <div className="inline-block h-8 w-8 border-2 border-green-power-200 border-t-green-power-600 rounded-full animate-spin"></div>
                        <p className="text-sm text-gray-600 font-medium">Uploading...</p>
                      </>
                    ) : (
                      <>
                        <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div className="flex text-sm text-gray-600">
                          <span className="relative cursor-pointer rounded-md font-medium text-green-power-600 hover:text-green-power-500 focus-within:outline-none">
                            Click to upload
                          </span>
                          <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-gray-500">PDF, JPG, PNG up to 5MB</p>
                      </>
                    )}
                  </div>
                </div>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  className="sr-only"
                />
              </label>
            </div>
          </div>
        )}

        {/* Files Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-50/50 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Files</h3>
                {isReportFolder && (
                  <p className="text-xs text-gray-600 mt-1">Review and approve work reports</p>
                )}
                {!canUpload && !isReportFolder && (
                  <p className="text-xs text-gray-600 mt-1">View and download files</p>
                )}
              </div>
            </div>
          </div>
          
          {loading ? (
            <div className="p-16 text-center">
              <div className="inline-block h-10 w-10 border-3 border-green-power-200 border-t-green-power-600 rounded-full animate-spin"></div>
              <p className="mt-4 text-sm text-gray-600 font-medium">Loading files...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="p-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <p className="text-base font-medium text-gray-700 mb-1">
                No files in this folder
              </p>
              <p className="text-sm text-gray-500">
                {canUpload ? 'Upload your first file to get started' : 'Files will appear here when available'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {files.map((file, idx) => {
                const isReport = isReportFile(file.folderPath) && file.fileType === 'pdf';
                const status = file.reportStatus;
                
                return (
                  <div 
                    key={file.cloudinaryPublicId} 
                    className="px-6 py-5 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-start gap-4">
                      {/* File Icon */}
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                        <span className="text-2xl">{getFileIcon(file.fileType)}</span>
                      </div>
                      
                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap mb-2">
                              <span className="text-base font-semibold text-gray-900 break-words">
                                {file.fileName}
                              </span>
                              {isReport && status && (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                                  status === 'approved' 
                                    ? 'bg-green-100 text-green-800 border border-green-200' 
                                    : status === 'read'
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}>
                                  {status === 'approved' ? (
                                    <>
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                      Approved
                                    </>
                                  ) : status === 'read' ? (
                                    <>
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                      </svg>
                                      Read
                                    </>
                                  ) : (
                                    <>
                                      <div className="w-2 h-2 rounded-full bg-current"></div>
                                      Unread
                                    </>
                                  )}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <span className="px-2 py-0.5 rounded bg-gray-100 font-medium text-gray-700">
                                  {file.fileType.toUpperCase()}
                                </span>
                              </span>
                              <span className="flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatUploadedDate(file.uploadedAt)}
                              </span>
                            </div>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isReport && status !== 'approved' && (
                              <button
                                onClick={() => handleApproveReport(file)}
                                disabled={approving === file.cloudinaryPublicId}
                                className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-green-power-600 to-green-power-700 hover:from-green-power-700 hover:to-green-power-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                              >
                                {approving === file.cloudinaryPublicId ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Approving...
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                    Approve
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDownloadFile(file)}
                              disabled={downloading === file.cloudinaryPublicId}
                              className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                            >
                              {downloading === file.cloudinaryPublicId ? (
                                <>
                                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                  Downloading...
                                </>
                              ) : (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                  Download
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
          )}
        </div>
      </div>
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
