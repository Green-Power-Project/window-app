'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import ProjectFolderTree from '@/components/ProjectFolderTree';
import CustomerLayout from '@/components/CustomerLayout';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
}

function ProjectViewContent() {
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
          setError('Project not found');
          setLoading(false);
          return;
        }

        const projectData = { id: projectDoc.id, ...projectDoc.data() } as Project;

        // Verify the project belongs to the current user
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
      unsubscribe();
    };
  }, [currentUser, params.id]);

  const headerSkeleton = useMemo(
    () => (
      <div className="px-8 py-8">
        <div className="mb-6 animate-pulse">
          <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="h-20 bg-gray-100" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6 animate-pulse">
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
      <CustomerLayout title="Loading project...">
        {headerSkeleton}
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

  return (
    <CustomerLayout title={project.name}>
      <div className="px-6 sm:px-8 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-sm text-gray-600 hover:text-green-power-700 font-medium flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.year && (
            <span className="text-sm text-gray-600">({project.year})</span>
          )}
        </div>

        <ProjectFolderTree projectId={project.id} />
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

