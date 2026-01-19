'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AppHeader from '@/components/AppHeader';
import Breadcrumbs from '@/components/Breadcrumbs';
import { useAuth } from '@/contexts/AuthContext';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, listAll, getDownloadURL, uploadBytes, getMetadata } from 'firebase/storage';
import { PROJECT_FOLDER_STRUCTURE } from '@/lib/folderStructure';
import { markFileAsRead, isFileRead } from '@/lib/fileReadTracking';
import { getReportStatus, approveReport, isReportFile, ReportStatus } from '@/lib/reportApproval';

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
}

interface FileItem {
  name: string;
  url: string;
  size: number;
  type: string;
  fullPath: string;
  folderPath: string; // The folder path within the project (e.g., "01_Customer_Uploads/Photos")
  storagePath: string; // Full storage path: projects/{projectId}/{folderPath}/{filename}
  reportStatus?: ReportStatus; // Only for report files
}

function FolderViewContent() {
  const params = useParams();
  const { currentUser } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [uploadError, setUploadError] = useState('');

  const projectId = params.id as string;
  const folderPath = Array.isArray(params.path) 
    ? params.path.join('/') 
    : (params.path ? String(params.path) : '');

  const isNewNotViewedFolder = folderPath === '00_New_Not_Viewed_Yet_';
  const canUpload = folderPath.startsWith('01_Customer_Uploads');
  const isReportFolder = folderPath.startsWith('03_Reports');
  
  // Build breadcrumbs
  const folderName = folderPath.split('/').pop() || folderPath;
  const breadcrumbs = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: project?.name || 'Project', href: project ? `/project/${projectId}` : undefined },
    { label: isNewNotViewedFolder ? 'Unread Files' : folderName }
  ];

  useEffect(() => {
    if (currentUser && projectId) {
      loadProject();
    }
  }, [currentUser, projectId]);

  useEffect(() => {
    if (project) {
      if (isNewNotViewedFolder) {
        loadUnreadFiles();
      } else {
        loadFiles();
      }
    }
  }, [project, folderPath, isNewNotViewedFolder]);

  async function loadProject() {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      const projectDoc = await getDoc(doc(db, 'projects', projectId));
      
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
    } catch (error) {
      console.error('Error loading project:', error);
      setError('Failed to load project');
      setLoading(false);
    }
  }

  async function loadUnreadFiles() {
    if (!project || !currentUser) return;
    setLoading(true);
    try {
      // Get all read file paths for this customer and project
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

      // Get all files from all folders (except 00_New_Not_Viewed_Yet_ and 01_Customer_Uploads)
      const allFiles: FileItem[] = [];
      
      // Function to recursively get all folder paths
      const getAllFolderPaths = (folders: typeof PROJECT_FOLDER_STRUCTURE): string[] => {
        const paths: string[] = [];
        folders.forEach((folder) => {
          if (folder.path !== '00_New_Not_Viewed_Yet_') {
            paths.push(folder.path);
            if (folder.children) {
              folder.children.forEach((child) => {
                paths.push(child.path);
              });
            }
          }
        });
        return paths;
      };

      const folderPaths = getAllFolderPaths(PROJECT_FOLDER_STRUCTURE);
      
      // Load files from each folder
      for (const folderPath of folderPaths) {
        try {
          const folderRef = ref(storage, `projects/${projectId}/${folderPath}`);
          const fileList = await listAll(folderRef);
          
          for (const itemRef of fileList.items) {
            const storagePath = itemRef.fullPath;
            // Check if file is unread
            if (!readFilePaths.has(storagePath)) {
              try {
                const [url, metadata] = await Promise.all([
                  getDownloadURL(itemRef),
                  getMetadata(itemRef)
                ]);
                const fileItem: FileItem = {
                  name: itemRef.name,
                  url,
                  size: metadata.size,
                  type: metadata.contentType || 'application/octet-stream',
                  fullPath: itemRef.fullPath,
                  folderPath: folderPath,
                  storagePath: storagePath,
                };

                // Check report status if this is a report file
                if (isReportFile(folderPath) && metadata.contentType?.includes('pdf') && currentUser) {
                  const isRead = readFilePaths.has(storagePath);
                  fileItem.reportStatus = await getReportStatus(projectId, currentUser.uid, storagePath, isRead);
                }

                allFiles.push(fileItem);
              } catch (err) {
                console.error('Error loading file:', itemRef.name, err);
              }
            }
          }
        } catch (error: any) {
          if (error.code !== 'storage/object-not-found') {
            console.error('Error loading folder:', folderPath, error);
          }
        }
      }

      setFiles(allFiles);
    } catch (error) {
      console.error('Error loading unread files:', error);
      setError('Failed to load unread files');
    } finally {
      setLoading(false);
    }
  }

  async function loadFiles() {
    if (!project || !folderPath || !currentUser) return;
    setLoading(true);
    try {
      const folderRef = ref(storage, `projects/${projectId}/${folderPath}`);
      const fileList = await listAll(folderRef);
      
      const filesList: FileItem[] = [];
      for (const itemRef of fileList.items) {
        try {
          const [url, metadata] = await Promise.all([
            getDownloadURL(itemRef),
            getMetadata(itemRef)
          ]);
          const storagePath = itemRef.fullPath;
          
          const fileItem: FileItem = {
            name: itemRef.name,
            url,
            size: metadata.size,
            type: metadata.contentType || 'application/octet-stream',
            fullPath: itemRef.fullPath,
            folderPath: folderPath,
            storagePath: storagePath,
          };

          // Check report status if this is a report file
          if (isReportFile(folderPath) && metadata.contentType?.includes('pdf')) {
            const isRead = await isFileRead(projectId, currentUser.uid, storagePath);
            fileItem.reportStatus = await getReportStatus(projectId, currentUser.uid, storagePath, isRead);
          }

          filesList.push(fileItem);
        } catch (err) {
          console.error('Error loading file:', itemRef.name, err);
        }
      }
      setFiles(filesList);
    } catch (error: any) {
      if (error.code === 'storage/object-not-found') {
        setFiles([]);
      } else {
        console.error('Error loading files:', error);
        setError('Failed to load files');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleFileOpen(file: FileItem) {
    if (!currentUser || !project) return;
    
    try {
      // Mark file as read
      await markFileAsRead(projectId, currentUser.uid, file.storagePath);
      
      // Update report status if it's a report
      if (file.reportStatus && isReportFile(file.folderPath)) {
        file.reportStatus = await getReportStatus(projectId, currentUser.uid, file.storagePath, true);
        // Update the file in the list
        setFiles(files.map(f => f.storagePath === file.storagePath ? file : f));
      }
      
      // If we're in the "New Not Viewed Yet" folder, reload to remove the file
      if (isNewNotViewedFolder) {
        await loadUnreadFiles();
      }
    } catch (error) {
      console.error('Error marking file as read:', error);
      // Don't block file opening if tracking fails
    }
  }

  async function handleApproveReport(file: FileItem) {
    if (!currentUser || !project) return;
    
    setApproving(file.storagePath);
    try {
      await approveReport(projectId, currentUser.uid, file.storagePath);
      
      // Update file status
      file.reportStatus = 'approved';
      setFiles(files.map(f => f.storagePath === file.storagePath ? file : f));
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
    
    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setUploading(true);
    try {
      const fileRef = ref(storage, `projects/${projectId}/${folderPath}/${file.name}`);
      await uploadBytes(fileRef, file);
      await loadFiles();
      e.target.value = '';
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadError('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getFileIcon(type: string): string {
    if (type.includes('pdf')) return '📄';
    if (type.includes('image')) return '🖼️';
    return '📎';
  }

  if (loading && !project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader breadcrumbs={breadcrumbs} />
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader breadcrumbs={breadcrumbs} />
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="bg-white border border-gray-200 rounded-sm p-8">
            <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm mb-4">
              {error || 'Project not found'}
            </div>
            <a
              href="/dashboard"
              className="text-sm text-green-power-600 hover:text-green-power-700 font-medium"
            >
              ← Back to Dashboard
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader breadcrumbs={breadcrumbs} />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Breadcrumbs items={breadcrumbs} />

        <div className="mb-6">
          <h2 className="text-base font-semibold text-gray-900">{project.name}</h2>
          {project.year && (
            <p className="text-xs text-gray-500 mt-1">{project.year}</p>
          )}
          {!isNewNotViewedFolder && (
            <p className="text-sm text-gray-600 mt-2">Folder: {folderName}</p>
          )}
        </div>

        {canUpload && (
          <div className="bg-white border border-gray-200 rounded-sm mb-6">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Upload File</h3>
              <p className="text-xs text-gray-500 mt-0.5">Allowed: PDF, JPG, PNG (max 5 MB)</p>
            </div>
            <div className="p-5">
              {uploadError && (
                <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm mb-4">
                  {uploadError}
                </div>
              )}
              <input
                type="file"
                onChange={handleFileUpload}
                disabled={uploading}
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer disabled:opacity-50"
              />
              {uploading && (
                <p className="mt-2 text-xs text-gray-500">Uploading file...</p>
              )}
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-sm">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Files</h3>
            {isNewNotViewedFolder && (
              <p className="text-xs text-gray-500 mt-0.5">Unread files - click to view and mark as read</p>
            )}
            {isReportFolder && (
              <p className="text-xs text-gray-500 mt-0.5">Work reports - view and approve</p>
            )}
            {!canUpload && !isNewNotViewedFolder && !isReportFolder && (
              <p className="text-xs text-gray-500 mt-0.5">View and download only</p>
            )}
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
              <p className="mt-4 text-sm text-gray-500">Loading files...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-gray-500">
                {isNewNotViewedFolder 
                  ? 'No unread files.' 
                  : 'No files in this folder.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {files.map((file) => {
                const isReport = isReportFile(file.folderPath) && file.type.includes('pdf');
                const status = file.reportStatus;
                
                return (
                  <div key={file.fullPath} className="px-5 py-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center flex-1 min-w-0">
                        <span className="mr-3 text-lg">{getFileIcon(file.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => handleFileOpen(file)}
                              className="text-sm text-gray-900 hover:text-green-power-600 break-words"
                            >
                              {file.name}
                            </a>
                            {isReport && status && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                status === 'approved' 
                                  ? 'bg-green-100 text-green-800' 
                                  : status === 'read'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {status === 'approved' ? 'Approved' : status === 'read' ? 'Read' : 'Unread'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatFileSize(file.size)}
                            {isNewNotViewedFolder && file.folderPath && (
                              <span className="ml-2">• {file.folderPath}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="ml-4 flex items-center space-x-2">
                        {isReport && status !== 'approved' && (
                          <button
                            onClick={() => handleApproveReport(file)}
                            disabled={approving === file.storagePath}
                            className="px-3 py-1.5 text-xs text-white bg-green-power-500 hover:bg-green-power-600 rounded-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {approving === file.storagePath ? 'Approving...' : 'Approve'}
                          </button>
                        )}
                        <a
                          href={file.url}
                          download={file.name}
                          onClick={() => handleFileOpen(file)}
                          className="px-3 py-1.5 text-xs text-gray-700 hover:text-gray-900 border border-gray-300 rounded-sm hover:bg-gray-50 font-medium"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function FolderViewPage() {
  return (
    <ProtectedRoute>
      <FolderViewContent />
    </ProtectedRoute>
  );
}
