'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AppHeader from '@/components/AppHeader';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore';

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
}

export default function DashboardContent() {
  const { currentUser } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser) {
      loadProjects();
    }
  }, [currentUser]);

  async function loadProjects() {
    if (!currentUser) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'projects'),
        where('customerId', '==', currentUser.uid),
        orderBy('name', 'asc')
      );
      const querySnapshot = await getDocs(q);
      const projectsList: Project[] = [];
      querySnapshot.forEach((doc) => {
        projectsList.push({ id: doc.id, ...doc.data() } as Project);
      });
      setProjects(projectsList);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader breadcrumbs={[{ label: 'Dashboard' }]} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-gray-900">My Projects</h2>
          <p className="text-xs text-gray-500 mt-1">Select a project to view details</p>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <p className="text-sm text-gray-500">No projects assigned yet.</p>
            <p className="text-xs text-gray-400 mt-2">Contact your administrator if you expect to see projects here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/project/${project.id}`}
                className="bg-white border border-gray-200 rounded-sm p-5 hover:border-green-power-500 hover:shadow-sm transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900 flex-1">
                    {project.name}
                  </h3>
                </div>
                {project.year && (
                  <p className="text-xs text-gray-500 mt-2">
                    {project.year}
                  </p>
                )}
                <div className="mt-4 flex items-center text-xs text-green-power-600">
                  <span>View project</span>
                  <span className="ml-1">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
