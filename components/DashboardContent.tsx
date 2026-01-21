'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import CustomerLayout from '@/components/CustomerLayout';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
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
    if (!currentUser || !db) return;

    // Always show loader until data arrives
    setLoading(true);

    // Real-time listener for projects
    const q = query(
      collection(db, 'projects'),
      where('customerId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const projectsList: Project[] = [];
        querySnapshot.forEach((doc) => {
          projectsList.push({ id: doc.id, ...doc.data() } as Project);
        });
        // Sort projects by name in memory (ascending)
        projectsList.sort((a, b) => a.name.localeCompare(b.name));
        setProjects(projectsList);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to projects:', error);
        setLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => {
      unsubscribe();
    };
  }, [currentUser]);

  const skeleton = useMemo(
    () => (
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="inline-block h-8 w-8 border-3 border-green-power-200 border-t-green-power-600 rounded-full animate-spin"></div>
          <p className="mt-4 text-sm text-gray-600 font-medium">Loading projects...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 animate-pulse">
              <div className="h-5 w-32 bg-gray-200 rounded mb-3" />
              <div className="h-4 w-20 bg-gray-200 rounded mb-6" />
              <div className="h-3 w-full bg-gray-200 rounded mb-2" />
              <div className="h-3 w-5/6 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    ),
    []
  );

  return (
    <CustomerLayout title="Dashboard">
      <div className="px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">My Projects</h2>
          <p className="text-sm text-gray-600">Select a project to view details</p>
        </div>

        {loading ? (
          skeleton
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <div className="text-6xl mb-4">📁</div>
            <p className="text-base font-medium text-gray-700 mb-2">No projects assigned yet.</p>
            <p className="text-sm text-gray-500">Contact your administrator if you expect to see projects here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/project/${project.id}`}
                className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-200 border-l-4 border-green-power-500 hover:scale-105"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      {project.name}
                    </h3>
                    {project.year && (
                      <p className="text-sm text-gray-500">
                        Year: {project.year}
                      </p>
                    )}
                  </div>
                  <div className="text-2xl">📁</div>
                </div>
                <div className="mt-4 flex items-center text-sm font-medium text-green-power-600">
                  <span>View project</span>
                  <span className="ml-2">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
