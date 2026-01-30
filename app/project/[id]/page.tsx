'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import ProjectFolderTree from '@/components/ProjectFolderTree';
import CustomerLayout from '@/components/CustomerLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
  folderDisplayNames?: Record<string, string>;
}

function ProjectViewContent() {
  const { t } = useLanguage();
  const params = useParams();
  const { currentUser } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const headerSkeleton = useMemo(
    () => (
      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="mb-6 animate-pulse">
          <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="h-20 bg-gray-100" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 animate-pulse">
          <div className="h-5 w-44 bg-gray-200 rounded mb-3" />
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-5/6" />
            <div className="h-3 bg-gray-200 rounded w-4/6" />
          </div>
        </div>
      </div>
    ),
    []
  );

  if (loading) {
    return (
      <CustomerLayout title={t('common.loading')}>
        {headerSkeleton}
      </CustomerLayout>
    );
  }

  if (error || !project) {
    return (
      <CustomerLayout title={t('messages.error.generic')}>
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8">
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

  return (
    <CustomerLayout title={project.name}>
      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-sm text-gray-600 hover:text-green-power-700 font-medium flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('common.back')} {t('navigation.dashboard')}
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.year && (
            <span className="text-sm text-gray-600">({project.year})</span>
          )}
        </div>

        <ProjectFolderTree projectId={project.id} folderDisplayNames={project.folderDisplayNames} />
      </div>
    </CustomerLayout>
  );
}

export default function ProjectViewPage() {
  return (
    <ProtectedRoute>
      <ProjectViewContent />
    </ProtectedRoute>
  );
}

