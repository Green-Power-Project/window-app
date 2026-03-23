'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import ProjectFolderTree from '@/components/ProjectFolderTree';
import ProjectChatPanel from '@/components/ProjectChatPanel';
import UnreadBadge from '@/components/UnreadBadge';
import { useChatUnreadCount } from '@/hooks/useChatUnreadCount';
import { useAuth } from '@/contexts/AuthContext';
import { useLayoutTitle } from '@/contexts/LayoutTitleContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { sanitizeCustomFolderName, PROJECT_FOLDER_STRUCTURE } from '@/lib/folderStructure';
import { appendDynamicSubfolderTransaction } from '@/lib/appendDynamicSubfolderTransaction';

interface Project {
  id: string;
  name: string;
  projectNumber?: string;
  year?: number;
  customerId: string;
  folderDisplayNames?: Record<string, string>;
  customFolders?: string[];
  customFolderSubtitles?: Record<string, string>;
  customFolderImages?: Record<string, string>;
  dynamicSubfolders?: Record<string, string[]>;
}

function ProjectViewContent() {
  const { t } = useLanguage();
  const params = useParams();
  const { currentUser } = useAuth();
  const { setTitle } = useLayoutTitle();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) setTitle(t('common.loading'));
    else if (error || !project) setTitle(t('messages.error.generic'));
    else setTitle(project.name);
    return () => setTitle(null);
  }, [loading, error, project, t, setTitle]);

  // Safeguard: prevent infinite loading if listener never fires
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading((prev) => (prev ? false : prev));
    }, 15000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!currentUser || !params.id || !db) return;

    const projectId = params.id as string;
    setLoading(true);
    setError('');

    // Real-time listener for project document
    const unsubscribe = onSnapshot(
      doc(db, 'projects', projectId),
      (projectDoc) => {
        if (!projectDoc.exists()) {
          setError(t('messages.error.notFound'));
          setLoading(false);
          return;
        }

        const projectData = { id: projectDoc.id, ...projectDoc.data() } as Project & { enabled?: boolean };

        if (projectData.customerId !== currentUser.uid) {
          setError(t('messages.error.permission'));
          setLoading(false);
          return;
        }

        if (projectData.enabled === false) {
          setError(t('messages.error.projectDeactivated'));
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
      unsubscribe();
    };
  }, [currentUser, params.id, t]);

  const projectId = params.id as string;

  const handleCreateSubfolder = useCallback(
    async (parentPath: string, displayName: string) => {
      if (!projectId || !db) return;
      const segment = sanitizeCustomFolderName(displayName);
      if (!segment) return;
      const fullPath = `${parentPath}/${segment}`;
      try {
        await appendDynamicSubfolderTransaction(
          db,
          projectId,
          PROJECT_FOLDER_STRUCTURE,
          parentPath,
          segment,
          displayName.trim(),
          fullPath
        );
      } catch (e) {
        console.error(e);
      }
    },
    [projectId]
  );

  const [chatOpen, setChatOpen] = useState(false);
  const chatUnread = useChatUnreadCount(typeof params.id === 'string' ? params.id : null);

  const headerSkeleton = useMemo(
    () => (
      <div className="space-y-6 animate-pulse">
        <div className="h-4 w-32 bg-gray-200/80 rounded" />
        <div className="rounded-2xl overflow-hidden bg-gray-100 h-24" />
        <div className="h-5 w-44 bg-gray-200/80 rounded mb-3" />
        <div className="space-y-2">
          <div className="h-3 bg-gray-200/80 rounded w-full" />
          <div className="h-3 bg-gray-200/80 rounded w-5/6" />
          <div className="h-3 bg-gray-200/80 rounded w-4/6" />
        </div>
      </div>
    ),
    []
  );

  if (loading) {
    return (
      <div className="px-3 sm:px-6 lg:px-10 py-4 sm:py-6">
        <div className="rounded-3xl bg-[#f7f3ee] border border-white/60 shadow-xl px-4 sm:px-6 py-6">
          {headerSkeleton}
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="px-3 sm:px-6 lg:px-10 py-4 sm:py-6">
        <div className="rounded-3xl bg-[#f7f3ee] border border-white/60 shadow-xl p-6 sm:p-8">
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
    );
  }

  return (
    <>
      <div className="min-h-full flex flex-col">
        {/* Project hero strip – full-width, same visual tone as dashboard/login */}
        <div
          className="relative w-full h-48 sm:h-56 md:h-64 overflow-hidden flex-shrink-0"
          style={{
            backgroundImage: 'url(/desktop-bg.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(165deg, rgba(22,101,52,0.35) 0%, rgba(13,71,41,0.5) 30%, rgba(0,0,0,0.25) 50%, rgba(8,47,35,0.7) 75%, rgba(0,0,0,0.55) 100%)',
            }}
          />
          <div className="absolute top-3 right-3 sm:top-5 sm:right-5 z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="min-h-[44px] flex items-center justify-center gap-2 rounded-full bg-white/95 text-gray-800 text-sm font-semibold shadow-lg hover:bg-white active:bg-white transition-colors px-4 py-2.5 relative"
            >
              <Image
                src="/chat-icon.png"
                alt=""
                width={22}
                height={22}
                className="rounded-md flex-shrink-0"
                style={{ width: 'auto', height: 'auto' }}
              />
              <span>{t('projects.projectChat')}</span>
              <UnreadBadge count={chatUnread} className="absolute -top-1 -right-1" size="sm" variant="chat" />
            </button>
          </div>
          <div className="absolute inset-0 flex flex-col items-start justify-start pt-3 sm:pt-5 lg:pt-6 px-4 sm:px-6 lg:px-10 text-white">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm text-white/90 hover:text-white font-medium mb-2 sm:mb-3 transition-colors w-fit min-h-[44px] py-2 -my-1 justify-center"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('common.back')} {t('navigation.dashboard')}
            </Link>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                {project.name}
              </h1>
              {project.year != null && (
                <span className="text-sm sm:text-base text-white/90">({project.year})</span>
              )}
            </div>
            {project.projectNumber?.trim() && (
              <p className="mt-1.5 text-sm text-white/90 font-mono tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                {t('dashboard.projectNumber')}: {project.projectNumber.trim()}
              </p>
            )}
          </div>
        </div>

        {/* Content panel – overlaps hero, same style as dashboard */}
        <div className="flex-1 px-3 sm:px-6 lg:px-10 -mt-8 sm:-mt-12 relative z-10 pb-[env(safe-area-inset-bottom)]">
          <div className="rounded-3xl bg-[#f7f3ee] shadow-[0_24px_60px_rgba(0,0,0,0.25)] border border-white/60 px-4 sm:px-6 lg:px-8 py-5 sm:py-8 lg:py-10">
            <ProjectFolderTree
              projectId={project.id}
              folderDisplayNames={project.folderDisplayNames}
              customFolders={project.customFolders}
              customFolderImages={project.customFolderImages}
              dynamicSubfolders={project.dynamicSubfolders}
              onCreateSubfolder={handleCreateSubfolder}
            />
          </div>
        </div>
      </div>
      {currentUser && (
        <ProjectChatPanel
          projectId={project.id}
          projectName={project.name}
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          currentUserId={currentUser.uid}
        />
      )}
    </>
  );
}

export default function ProjectViewPage() {
  return <ProjectViewContent />;
}

