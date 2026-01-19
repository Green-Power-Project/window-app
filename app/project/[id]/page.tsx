'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import ProjectFolderTree from '@/components/ProjectFolderTree';
import AppHeader from '@/components/AppHeader';
import Breadcrumbs from '@/components/Breadcrumbs';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

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
    if (currentUser && params.id) {
      loadProject(params.id as string);
    }
  }, [currentUser, params.id]);

  async function loadProject(projectId: string) {
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

      // Verify the project belongs to the current user
      if (projectData.customerId !== currentUser.uid) {
        setError('You do not have access to this project');
        setLoading(false);
        return;
      }

      setProject(projectData);
    } catch (error) {
      console.error('Error loading project:', error);
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  }

function ProjectViewContent() {
  const params = useParams();
  const { currentUser } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const projectId = params.id as string;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Loading...' }]} />
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">Loading project...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Error' }]} />
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
      <AppHeader 
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: project.name }
        ]} 
      />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Breadcrumbs 
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: project.name }
          ]} 
        />

        <div className="mb-6">
          <div className="bg-white border border-gray-200 rounded-sm">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">{project.name}</h2>
              {project.year && (
                <p className="text-xs text-gray-500 mt-1">{project.year}</p>
              )}
            </div>
          </div>
        </div>

        <ProjectFolderTree projectId={project.id} />
      </main>
    </div>
  );
}

export default function ProjectViewPage() {
  return (
    <ProtectedRoute>
      <ProjectViewContent />
    </ProtectedRoute>
  );
}

