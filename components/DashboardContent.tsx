'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  thumbnailUrl?: string;
  updatedAt?: { seconds: number } | string;
  enabled?: boolean;
}

/** Format a date as relative time (e.g. "2 days ago", "yesterday") */
function formatRelativeTime(date: Date, t: (key: string, params?: Record<string, string | number>) => string): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('common.justNow');
  if (diffMins < 60) return t('common.minutesAgo', { n: diffMins });
  if (diffHours < 24) return t('common.hoursAgo', { n: diffHours });
  if (diffDays === 1) return t('common.yesterday');
  if (diffDays < 7) return t('common.daysAgo', { n: diffDays });
  if (diffDays < 30) return t('common.weeksAgo', { n: Math.floor(diffDays / 7) });
  return date.toLocaleDateString();
}

function getProjectUpdatedDate(project: Project): Date | null {
  if (!project.updatedAt) return null;
  if (typeof project.updatedAt === 'string') return new Date(project.updatedAt);
  if (typeof project.updatedAt === 'object' && 'seconds' in project.updatedAt) {
    return new Date(project.updatedAt.seconds * 1000);
  }
  return null;
}

const DEFAULT_PLACEHOLDER = '/desktop-bg.png';

export default function DashboardContent() {
  const { t } = useLanguage();
  const { currentUser } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser || !db) return;

    setLoading(true);

    const canViewAllProjects = typeof window !== 'undefined'
      ? sessionStorage.getItem('canViewAllProjects') === 'true'
      : false;

    const loggedInProjectId = typeof window !== 'undefined'
      ? sessionStorage.getItem('loggedInProjectId')
      : null;

    let unsubscribe: (() => void) | null = null;

    if (canViewAllProjects) {
      const q = query(
        collection(db, 'projects'),
        where('customerId', '==', currentUser.uid)
      );

      unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const projectsList: Project[] = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if ((data as { enabled?: boolean }).enabled !== false) {
              projectsList.push({ id: docSnap.id, ...data } as Project);
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
    } else if (loggedInProjectId) {
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
      const q = query(
        collection(db, 'projects'),
        where('customerId', '==', currentUser.uid)
      );

      unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const projectsList: Project[] = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if ((data as { enabled?: boolean }).enabled !== false) {
              projectsList.push({ id: docSnap.id, ...data } as Project);
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

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser]);

  const displayName = currentUser?.displayName?.trim()
    || (t('common.customerRole') as string);

  const skeleton = useMemo(
    () => (
      <div className="space-y-6">
        <div className="h-48 sm:h-56 rounded-2xl bg-gray-200 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="rounded-2xl overflow-hidden bg-gray-200 animate-pulse aspect-[4/3]" />
          ))}
        </div>
      </div>
    ),
    []
  );

  return (
    <div className="min-h-full flex flex-col">
        {/* Hero banner – top-left text, no bottom radius */}
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
          <div className="absolute inset-0 flex flex-col items-start justify-start pt-4 sm:pt-5 lg:pt-6 px-4 sm:px-6 lg:px-8 text-white">
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
              {t('dashboard.welcomeBack', { name: displayName })}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-white/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
              {t('dashboard.activeProjectsCount', { count: loading ? 0 : projects.length })}
            </p>
          </div>
        </div>

        {/* Main content panel – overlaps hero, soft light background */}
        <div className="flex-1 px-3 sm:px-6 lg:px-10 -mt-8 sm:-mt-10 relative z-10">
          <div className="rounded-3xl bg-[#f7f3ee] shadow-[0_24px_60px_rgba(0,0,0,0.25)] border border-white/60 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
            <div className="mb-6 sm:mb-8">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900">
                {t('dashboard.myProjects')}
              </h2>
              <p className="mt-1.5 text-sm sm:text-base text-gray-600">
                {t('dashboard.description')}
              </p>
            </div>

            {loading ? (
              skeleton
            ) : projects.length === 0 ? (
              <div className="bg-gradient-to-br from-white to-green-power-50/40 rounded-2xl shadow-xl p-8 sm:p-12 text-center border border-green-power-100">
                <div className="text-5xl sm:text-6xl mb-4">📁</div>
                <p className="text-base font-medium text-gray-700 mb-2">
                  {t('dashboard.noProjects')}
                </p>
                <p className="text-sm text-gray-500">{t('dashboard.contactAdmin')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {projects.map((project) => {
                  const thumbUrl =
                    (project.thumbnailUrl && project.thumbnailUrl.trim()) ||
                    (project as Project & { imageUrl?: string }).imageUrl?.trim() ||
                    DEFAULT_PLACEHOLDER;
                  const updatedDate = getProjectUpdatedDate(project);
                  const lastUpdatedText = updatedDate ? formatRelativeTime(updatedDate, t) : null;

                  return (
                    <Link
                      key={project.id}
                      href={`/project/${project.id}`}
                      className="group block rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 focus:ring-offset-transparent"
                    >
                      <div className="relative aspect-[16/9] bg-gray-100">
                        {thumbUrl.startsWith('http') ? (
                          // eslint-disable-next-line @next/next/no-img-element -- external thumbnail URLs from admin (read-only)
                          <img
                            src={thumbUrl}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <Image
                            src={thumbUrl}
                            alt=""
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 50vw"
                          />
                        )}
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background:
                              'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.35) 50%, rgba(8,47,35,0.85) 100%)',
                          }}
                        />
                        <div className="absolute top-2 right-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-power-700/95 text-white shadow">
                            {t('dashboard.active')}
                          </span>
                        </div>
                        <div className="absolute inset-x-0 bottom-0 px-4 pb-3 pt-6 text-white flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 sm:gap-3">
                          <div>
                            <h3 className="font-display text-base sm:text-lg font-bold drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                              {project.name}
                            </h3>
                            {project.year != null && (
                              <p className="text-xs text-white/90 mt-0.5">
                                {t('dashboard.year')}: {project.year}
                              </p>
                            )}
                            {lastUpdatedText && (
                              <p className="text-[10px] text-white/80 mt-0.5">
                                {t('dashboard.lastUpdated', { time: lastUpdatedText })}
                              </p>
                            )}
                          </div>
                          <div className="flex sm:justify-end">
                            <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-full bg-green-power-600 hover:bg-green-power-500 text-white text-xs font-semibold shadow transition-colors">
                              {t('dashboard.openProject')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
