'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
} from 'firebase/firestore';

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
}

interface ProjectSidebarProps {
  currentProjectId: string;
}

export default function ProjectSidebar({ currentProjectId }: ProjectSidebarProps) {
  const { t } = useLanguage();
  const { currentUser } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser || !db) return;

    setLoading(true);

    // Check if customer can view all projects
    const canViewAllProjects = typeof window !== 'undefined' 
      ? sessionStorage.getItem('canViewAllProjects') === 'true'
      : false;
    
    const loggedInProjectId = typeof window !== 'undefined'
      ? sessionStorage.getItem('loggedInProjectId')
      : null;

    let unsubscribe: (() => void) | null = null;
    
    if (canViewAllProjects) {
      // Show all projects for this customer
      const q = query(
        collection(db, 'projects'),
        where('customerId', '==', currentUser.uid)
      );

      unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const projectsList: Project[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if ((data as { enabled?: boolean }).enabled !== false) {
              projectsList.push({ id: doc.id, ...data } as Project);
            }
          });
          projectsList.sort((a, b) => a.name.localeCompare(b.name));
          setProjects(projectsList);
          setLoading(false);
        },
        (error) => {
          console.error('Error listening to projects:', error);
          setLoading(false);
        }
      );
    } else {
      // Show only the specific project they logged in with
      if (loggedInProjectId) {
        const projectDocRef = doc(db, 'projects', loggedInProjectId);
        
        unsubscribe = onSnapshot(
          projectDocRef,
          (docSnapshot) => {
            if (docSnapshot.exists()) {
              const projectData = { id: docSnapshot.id, ...docSnapshot.data() } as Project & { enabled?: boolean };
              if (projectData.customerId === currentUser.uid && projectData.enabled !== false) {
                setProjects([projectData]);
              } else {
                setProjects([]);
              }
            } else {
              setProjects([]);
            }
            setLoading(false);
          },
          (error) => {
            console.error('Error listening to project:', error);
            setLoading(false);
          }
        );
      } else {
        // Fallback: show all projects if loggedInProjectId is missing
        const q = query(
          collection(db, 'projects'),
          where('customerId', '==', currentUser.uid)
        );

        unsubscribe = onSnapshot(
          q,
          (querySnapshot) => {
            const projectsList: Project[] = [];
            querySnapshot.forEach((doc) => {
              const data = doc.data();
              if ((data as { enabled?: boolean }).enabled !== false) {
                projectsList.push({ id: doc.id, ...data } as Project);
              }
            });
            projectsList.sort((a, b) => a.name.localeCompare(b.name));
            setProjects(projectsList);
            setLoading(false);
          },
          (error) => {
            console.error('Error listening to projects:', error);
            setLoading(false);
          }
        );
      }
    }

    // Cleanup listener on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUser]);

  if (loading) {
    return (
      <div className="w-64 bg-white border-l border-gray-200 p-4">
        <div className="animate-pulse">
          <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-4 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-l border-gray-200 p-4 overflow-y-auto">
      <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">
        {t('dashboard.myProjectsSection')}
      </h3>
      
      {projects.length === 0 ? (
        <p className="text-sm text-gray-500">{t('dashboard.noProjects')}</p>
      ) : (
        <nav className="space-y-1">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/project/${project.id}`}
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                project.id === currentProjectId
                  ? 'bg-green-power-100 text-green-power-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <div className="font-medium">{project.name}</div>
              {project.year && (
                <div className="text-xs text-gray-500 mt-0.5">
                  {t('dashboard.year')}: {project.year}
                </div>
              )}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
