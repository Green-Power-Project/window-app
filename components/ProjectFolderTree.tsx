'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Folder, PROJECT_FOLDER_STRUCTURE, CUSTOM_FOLDER_PREFIX } from '@/lib/folderStructure';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateFolderPath, translateStatus, getProjectFolderDisplayName } from '@/lib/translations';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const unreadCountsCache: { key: string; data: Map<string, number>; ts: number }[] = [];

function getCachedUnreadCounts(projectId: string, userId: string): Map<string, number> | null {
  const entry = unreadCountsCache.find((e) => e.key === `${projectId}:${userId}`);
  if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.data;
}
function setCachedUnreadCounts(projectId: string, userId: string, data: Map<string, number>) {
  const key = `${projectId}:${userId}`;
  const idx = unreadCountsCache.findIndex((e) => e.key === key);
  if (idx >= 0) unreadCountsCache.splice(idx, 1);
  unreadCountsCache.push({ key, data: new Map(data), ts: Date.now() });
  if (unreadCountsCache.length > 20) unreadCountsCache.shift();
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

interface FolderTreeProps {
  projectId: string;
  folderDisplayNames?: Record<string, string>;
  customFolders?: string[];
  customFolderImages?: Record<string, string>;
}

const folderConfig: Record<string, { description: string; icon: string; gradient: string; color: string; subfolderBg: string }> = {
  '01_Customer_Uploads': {
    description: 'Files you uploaded for this project',
    icon: '📤',
    gradient: 'from-blue-500 to-cyan-500',
    color: 'text-blue-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '02_Photos': {
    description: 'Progress photos and visual documentation',
    icon: '📸',
    gradient: 'from-purple-500 to-pink-500',
    color: 'text-purple-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '03_Reports': {
    description: 'Daily and weekly reports from the team',
    icon: '📊',
    gradient: 'from-green-500 to-emerald-500',
    color: 'text-green-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '04_Emails': {
    description: 'Email communications and correspondence',
    icon: '📧',
    gradient: 'from-indigo-500 to-blue-500',
    color: 'text-indigo-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '05_Quotations': {
    description: 'Quotes, estimates and pricing documents',
    icon: '💰',
    gradient: 'from-yellow-500 to-amber-500',
    color: 'text-yellow-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '06_Invoices': {
    description: 'Invoices and billing documents',
    icon: '🧾',
    gradient: 'from-red-500 to-rose-500',
    color: 'text-red-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '07_Delivery_Notes': {
    description: 'Delivery notes and material tracking',
    icon: '🚚',
    gradient: 'from-teal-500 to-cyan-500',
    color: 'text-teal-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  '08_General': {
    description: 'General documents and miscellaneous files',
    icon: '📁',
    gradient: 'from-slate-500 to-gray-600',
    color: 'text-slate-600',
    subfolderBg: 'bg-gray-50/60 border-gray-200',
  },
  [CUSTOM_FOLDER_PREFIX]: {
    description: 'Your own folders (e.g. catalogs)',
    icon: '📂',
    gradient: 'from-amber-500 to-orange-500',
    color: 'text-amber-600',
    subfolderBg: 'bg-amber-50/60 border-amber-200',
  },
};

function ChildList({ childrenFolders, projectId, accentColor, subfolderBg, unreadCounts, folderDisplayNames, customFolderImages }: { childrenFolders: Folder[]; projectId: string; accentColor: string; subfolderBg: string; unreadCounts: Map<string, number>; folderDisplayNames?: Record<string, string>; customFolderImages?: Record<string, string> }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [navigating, setNavigating] = useState<string | null>(null);

  const handleSubfolderClick = (folderPath: string) => {
    setNavigating(folderPath);
    router.push(`/project/${projectId}/folder/${folderPath}`);
  };

  return (
    <div className="max-h-[240px] overflow-y-auto space-y-2 pt-2 pr-1 custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-300">
      {childrenFolders.map((child, idx) => {
        const hasGrandChildren = child.children && child.children.length > 0;
        const isNavigating = navigating === child.path;
        const unreadCount = unreadCounts.get(child.path) || 0;
        const customImageUrl = customFolderImages?.[child.path];
        
        return (
          <div
            key={child.path}
            onClick={() => handleSubfolderClick(child.path)}
            className={`group rounded-lg px-4 py-3 border ${subfolderBg} hover:shadow-md transition-all duration-200 cursor-pointer ${
              isNavigating ? 'opacity-50 pointer-events-none' : ''
            }`}
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200 shadow-sm overflow-hidden flex-shrink-0 ${customImageUrl ? 'bg-gray-100' : `bg-gradient-to-br ${accentColor}`}`}>
                {isNavigating ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : customImageUrl ? (
                  <img src={customImageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-base">📄</span>
                )}
              </div>
              <div className="flex-1 text-sm font-semibold text-gray-800 group-hover:text-gray-900 transition-colors duration-200 min-w-0">
                {getProjectFolderDisplayName(child.path, folderDisplayNames, t)}
              </div>
              {unreadCount > 0 && (
                <div className="px-2 py-1 rounded-full bg-red-500 text-white text-xs font-bold min-w-[20px] text-center">
                  {unreadCount}
                </div>
              )}
            </div>
            {hasGrandChildren && (
              <div className="mt-3 ml-12 space-y-2">
                {child.children!.map((grand, grandIdx) => {
                  const isGrandNavigating = navigating === grand.path;
                  const grandUnreadCount = unreadCounts.get(grand.path) || 0;
                  return (
                    <div
                      key={grand.path}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSubfolderClick(grand.path);
                      }}
                      className={`flex items-center gap-2.5 text-xs font-medium text-gray-700 hover:text-gray-900 transition-all duration-200 group/sub px-2 py-1.5 rounded-md ${subfolderBg} hover:shadow-sm cursor-pointer ${
                        isGrandNavigating ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${accentColor} opacity-70 group-hover/sub:opacity-100 transition-opacity`}></div>
                      {isGrandNavigating ? (
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                          <span>{getProjectFolderDisplayName(grand.path, folderDisplayNames, t)}</span>
                        </div>
                      ) : (
                        <span className="group-hover/sub:translate-x-1 transition-transform duration-200 flex-1">{getProjectFolderDisplayName(grand.path, folderDisplayNames, t)}</span>
                      )}
                      {grandUnreadCount > 0 && (
                        <div className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold min-w-[16px] text-center">
                          {grandUnreadCount}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FolderCard({ folder, projectId, totalUnreadCount, folderDisplayNames, customFolderImages }: { folder: Folder; projectId: string; totalUnreadCount: number; folderDisplayNames?: Record<string, string>; customFolderImages?: Record<string, string> }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const { currentUser } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const hasChildren = folder.children && folder.children.length > 0;
  const baseConfig = folderConfig[folder.path] || {
    description: t('folders.folderContents'),
    icon: '📁',
    gradient: 'from-gray-500 to-gray-600',
    color: 'text-gray-600',
    subfolderBg: 'bg-gray-50 border-gray-200',
  };
  const config = {
    ...baseConfig,
    description: t(`folders.${folder.path}.description`) || baseConfig.description,
  };

  // Load unread counts for all subfolders
  useEffect(() => {
    if (!currentUser || !hasChildren || !db) return;
    const dbInstance = db; // Store for TypeScript narrowing

    const loadUnreadCounts = async () => {
      try {
        // Get all read file paths for this customer (single query)
        const readFilesQuery = query(
          collection(dbInstance, 'fileReadStatus'),
          where('projectId', '==', projectId),
          where('customerId', '==', currentUser.uid)
        );
        const readFilesSnapshot = await getDocs(readFilesQuery);
        const readFilePaths = new Set<string>();
        readFilesSnapshot.forEach((doc) => {
          readFilePaths.add(doc.data().filePath);
        });

        // Collect all subfolders (children + grandchildren) to query in parallel
        const allSubfolders: Array<{ path: string; isCustomerUploads: boolean }> = [];
        const isCustomerUploads = folder.path.startsWith('01_Customer_Uploads');
        
        for (const child of folder.children!) {
          allSubfolders.push({ path: child.path, isCustomerUploads });
          
          if (child.children) {
            for (const grand of child.children) {
              allSubfolders.push({ path: grand.path, isCustomerUploads });
            }
          }
        }
        
        const countUnreadInFolder = async (folderPath: string, isCustomerUploads: boolean) => {
          try {
            const segments = getFolderSegments(folderPath);
            if (segments.length === 0) return { path: folderPath, count: 0 };
            
            const filesCollection = getProjectFolderRef(projectId, segments);
            let filesQuery;
            
            if (isCustomerUploads) {
              filesQuery = query(filesCollection, where('uploadedBy', '==', currentUser.uid));
            } else {
              filesQuery = query(filesCollection);
            }
            
            const snapshot = await getDocs(filesQuery);
            let unreadCount = 0;
            
            snapshot.forEach((doc) => {
              const data = doc.data();
              const filePath = data.cloudinaryPublicId as string;
              if (!readFilePaths.has(filePath)) {
                unreadCount++;
              }
            });
            
            return { path: folderPath, count: unreadCount };
          } catch (error) {
            console.error(`Error counting unread in ${folderPath}:`, error);
            return { path: folderPath, count: 0 };
          }
        };

        // Query ALL subfolders in parallel (much faster!)
        const countPromises = allSubfolders.map(subfolder =>
          countUnreadInFolder(subfolder.path, subfolder.isCustomerUploads)
        );

        const results = await Promise.all(countPromises);
        
        // Build the counts map
        const counts = new Map<string, number>();
        results.forEach(({ path, count }) => {
          counts.set(path, count);
        });
        
        setUnreadCounts(counts);
      } catch (error) {
        console.error('Error loading unread counts:', error);
      }
    };

    loadUnreadCounts();
  }, [currentUser, projectId, folder.path, folder.children, hasChildren]);

  return (
    <div className="group relative rounded-2xl overflow-hidden bg-white shadow-md hover:shadow-lg border border-gray-100 hover:border-green-power-200 transition-all duration-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 text-left hover:bg-gray-50 transition-colors duration-150 ${open ? 'rounded-t-2xl' : 'rounded-2xl'}`}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Icon */}
          <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gray-100 flex items-center justify-center shadow-sm">
            <span className="text-2xl">{config.icon}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm sm:text-base font-semibold text-gray-900 mb-0.5 flex items-center gap-2">
              {getProjectFolderDisplayName(folder.path, folderDisplayNames, t)}
            </div>
            <div className="text-xs text-gray-500">
              {t(`folders.${folder.path}.description`) || config.description}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          {totalUnreadCount > 0 && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-red-500/90 text-white text-xs font-semibold">
              {totalUnreadCount} {translateStatus('unread', t)}
            </span>
          )}
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 group-hover:bg-gray-200 transition-colors duration-150">
            <svg
              className={`w-4 h-4 transform transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Smooth accordion animation */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          open ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {hasChildren && (
          <div className="px-6 pb-6 border-t border-gray-100">
            <ChildList
              childrenFolders={folder.children!}
              projectId={projectId}
              accentColor={config.gradient}
              subfolderBg={config.subfolderBg}
              unreadCounts={unreadCounts}
              folderDisplayNames={folderDisplayNames}
              customFolderImages={customFolderImages}
            />
          </div>
        )}

        {!hasChildren && (
          <div className="px-6 pb-6 text-sm text-gray-500 italic text-center py-4">
            {t('projects.noFiles')}
          </div>
        )}
      </div>
    </div>
  );
}

function getCustomFolderDisplayName(path: string): string {
  const segment = path.split('/').pop() || path;
  return segment.replace(/_/g, ' ');
}

export default function ProjectFolderTree({ projectId, folderDisplayNames, customFolders = [], customFolderImages }: FolderTreeProps) {
  const { t } = useLanguage();
  const { currentUser } = useAuth();
  const folders = useMemo(() => {
    const base = PROJECT_FOLDER_STRUCTURE;
    if (!customFolders.length) return base;
    const customChildren: Folder[] = customFolders.map((path) => ({
      name: getCustomFolderDisplayName(path),
      path,
    }));
    return [...base, { name: CUSTOM_FOLDER_PREFIX, path: CUSTOM_FOLDER_PREFIX, children: customChildren }];
  }, [customFolders]);
  const [folderUnreadCounts, setFolderUnreadCounts] = useState<Map<string, number>>(new Map());

  // Calculate total unread counts for each folder; use cache to avoid calling API every time
  useEffect(() => {
    if (!currentUser || !db) return;
    const cached = getCachedUnreadCounts(projectId, currentUser.uid);
    if (cached) {
      setFolderUnreadCounts(cached);
      return;
    }
    const dbInstance = db; // Store for TypeScript narrowing

    const loadFolderUnreadCounts = async () => {
      try {
        // Get all read file paths for this customer (single query)
        const readFilesQuery = query(
          collection(dbInstance, 'fileReadStatus'),
          where('projectId', '==', projectId),
          where('customerId', '==', currentUser.uid)
        );
        const readFilesSnapshot = await getDocs(readFilesQuery);
        const readFilePaths = new Set<string>();
        readFilesSnapshot.forEach((doc) => {
          readFilePaths.add(doc.data().filePath);
        });

        // Collect all subfolders to query in parallel
        const allSubfolders: Array<{ path: string; isCustomerUploads: boolean; parentPath: string }> = [];
        
        for (const folder of folders) {
          if (!folder.children) continue;
          const isCustomerUploads = folder.path.startsWith('01_Customer_Uploads');
          
          for (const child of folder.children) {
            allSubfolders.push({
              path: child.path,
              isCustomerUploads,
              parentPath: folder.path,
            });
            
            if (child.children) {
              for (const grand of child.children) {
                allSubfolders.push({
                  path: grand.path,
                  isCustomerUploads,
                  parentPath: folder.path,
                });
              }
            }
          }
        }

        // Count unread files in a folder
        const countUnreadInFolder = async (folderPath: string, isCustomerUploads: boolean) => {
          try {
            const segments = getFolderSegments(folderPath);
            if (segments.length === 0) return 0;
            
            const filesCollection = getProjectFolderRef(projectId, segments);
            let filesQuery;
            
            if (isCustomerUploads) {
              filesQuery = query(filesCollection, where('uploadedBy', '==', currentUser.uid));
            } else {
              filesQuery = query(filesCollection);
            }
            
            const snapshot = await getDocs(filesQuery);
            let unreadCount = 0;
            
            snapshot.forEach((doc) => {
              const data = doc.data();
              const filePath = data.cloudinaryPublicId as string;
              if (!readFilePaths.has(filePath)) {
                unreadCount++;
              }
            });
            
            return unreadCount;
          } catch (error) {
            return 0;
          }
        };

        // Query ALL subfolders in parallel (much faster!)
        const countPromises = allSubfolders.map(subfolder =>
          countUnreadInFolder(subfolder.path, subfolder.isCustomerUploads).then(count => ({
            path: subfolder.path,
            count,
            parentPath: subfolder.parentPath,
          }))
        );

        const subfolderCounts = await Promise.all(countPromises);

        // Aggregate counts by parent folder
        const counts = new Map<string, number>();
        for (const { parentPath, count } of subfolderCounts) {
          const currentTotal = counts.get(parentPath) || 0;
          counts.set(parentPath, currentTotal + count);
        }

        setCachedUnreadCounts(projectId, currentUser.uid, counts);
        setFolderUnreadCounts(counts);
      } catch (error) {
        console.error('Error loading folder unread counts:', error);
      }
    };

    loadFolderUnreadCounts();
  }, [currentUser, projectId, folders]);

  return (
    <div className="space-y-6">

      {/* Sections grid – consistent 2-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {folders.map((folder, idx) => (
          <div
            key={folder.path}
            style={{ animationDelay: `${idx * 100}ms` }}
            className="animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <FolderCard
              folder={folder}
              projectId={projectId}
              totalUnreadCount={folderUnreadCounts.get(folder.path) || 0}
              folderDisplayNames={folderDisplayNames}
              customFolderImages={customFolderImages}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

