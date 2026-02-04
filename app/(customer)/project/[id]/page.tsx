'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ProjectFolderTree from '@/components/ProjectFolderTree';
import { useAuth } from '@/contexts/AuthContext';
import { useLayoutTitle } from '@/contexts/LayoutTitleContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { toCustomFolderPath } from '@/lib/folderStructure';

async function uploadFolderImage(file: File, projectId: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', `projects/${projectId}/folder_icons`);
  const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Upload failed');
  }
  const data = await res.json();
  return data.secure_url;
}

function CreateFolderPopup({
  isOpen,
  onClose,
  onCreate,
  t,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { title: string; subtitle?: string; imageFile?: File | null }) => Promise<void>;
  t: (key: string) => string;
}) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (file) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setImagePreview(url);
    } else {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setAdding(true);
    try {
      await onCreate({ title: trimmedTitle, subtitle: subtitle.trim() || undefined, imageFile: imageFile || undefined });
      setTitle('');
      setSubtitle('');
      setImageFile(null);
      setImagePreview(null);
      onClose();
    } catch (e) {
      console.error('Failed to add folder:', e);
    } finally {
      setAdding(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setSubtitle('');
    setImageFile(null);
    setImagePreview(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={handleClose} aria-hidden />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="rounded-2xl bg-white shadow-xl border border-gray-100 w-full max-w-md pointer-events-auto overflow-hidden max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-1.5 w-full bg-orange-500 flex-shrink-0" />
          <div className="px-6 py-5 overflow-y-auto">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <span className="text-2xl">📂</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">{t('projects.yourFolders')}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{t('projects.yourFoldersDescription')}</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-4">{t('projects.noCustomFolders')}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('projects.folderTitle')}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('projects.newFolderPlaceholder')}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                  disabled={adding}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('projects.folderSubtitle')}</label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder={t('projects.folderSubtitle')}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                  disabled={adding}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('projects.folderImage')}</label>
                <p className="text-[11px] text-gray-500 mb-1.5">{t('projects.folderImageHint')}</p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
                  disabled={adding}
                />
                {imagePreview && (
                  <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 w-20 h-20">
                    <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={adding}
                className="px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={adding || !title.trim()}
                className="px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ backgroundColor: '#A8DDC1' }}
              >
                {adding ? t('common.loading') : t('projects.createFolder')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
  folderDisplayNames?: Record<string, string>;
  customFolders?: string[];
  customFolderSubtitles?: Record<string, string>;
  customFolderImages?: Record<string, string>;
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
  const handleAddCustomFolder = useCallback(
    async (data: { title: string; subtitle?: string; imageFile?: File | null }) => {
      if (!projectId || !db || !project) return;
      const path = toCustomFolderPath(data.title);
      const current = project.customFolders || [];
      if (current.includes(path)) return;

      let imageUrl: string | undefined;
      if (data.imageFile) {
        imageUrl = await uploadFolderImage(data.imageFile, projectId);
      }

      const updates: Record<string, unknown> = {
        customFolders: [...current, path],
        folderDisplayNames: { ...(project.folderDisplayNames || {}), [path]: data.title },
      };
      if (data.subtitle !== undefined) {
        updates.customFolderSubtitles = { ...(project.customFolderSubtitles || {}), [path]: data.subtitle };
      }
      if (imageUrl) {
        updates.customFolderImages = { ...(project.customFolderImages || {}), [path]: imageUrl };
      }
      await updateDoc(doc(db, 'projects', projectId), updates);
    },
    [projectId, project]
  );

  const [createFolderPopupOpen, setCreateFolderPopupOpen] = useState(false);

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
          <button
            type="button"
            onClick={() => setCreateFolderPopupOpen(true)}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 z-10 px-4 py-2 rounded-full bg-white/95 text-gray-800 text-sm font-semibold shadow-lg hover:bg-white transition-colors flex items-center gap-2"
          >
            <span>📂</span>
            {t('projects.createFolder')}
          </button>
          <div className="absolute inset-0 flex flex-col items-start justify-start pt-4 sm:pt-5 lg:pt-6 px-4 sm:px-6 lg:px-10 text-white">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm text-white/90 hover:text-white font-medium mb-2 sm:mb-3 transition-colors w-fit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          </div>
        </div>

        {/* Content panel – overlaps hero, same style as dashboard */}
        <div className="flex-1 px-3 sm:px-6 lg:px-10 -mt-10 sm:-mt-12 relative z-10">
          <div className="rounded-3xl bg-[#f7f3ee] shadow-[0_24px_60px_rgba(0,0,0,0.25)] border border-white/60 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
            <ProjectFolderTree
              projectId={project.id}
              folderDisplayNames={project.folderDisplayNames}
              customFolders={project.customFolders}
              customFolderImages={project.customFolderImages}
            />
          </div>
        </div>
      </div>
      <CreateFolderPopup
        isOpen={createFolderPopupOpen}
        onClose={() => setCreateFolderPopupOpen(false)}
        onCreate={handleAddCustomFolder}
        t={t}
      />
    </>
  );
}

export default function ProjectViewPage() {
  return <ProjectViewContent />;
}

