'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';

interface NavItem {
  name: string;
  href: string;
  icon: string;
}

interface Project {
  id: string;
  name: string;
  year?: number;
  customerId: string;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  const navigation: NavItem[] = [
    { name: t('navigation.dashboard'), href: '/dashboard', icon: '📊' },
    { name: t('navigation.sGallery'), href: '/s-gallery', icon: '🖼️' },
    { name: t('navigation.profile'), href: '/profile', icon: '⚙️' },
  ];

  // Load projects for sidebar list (below Dashboard) - same logic as ProjectSidebar
  useEffect(() => {
    if (!currentUser || !db) {
      setProjectsLoading(false);
      return;
    }
    setProjectsLoading(true);
    const canViewAllProjects = typeof window !== 'undefined' ? sessionStorage.getItem('canViewAllProjects') === 'true' : false;
    const loggedInProjectId = typeof window !== 'undefined' ? sessionStorage.getItem('loggedInProjectId') : null;
    let unsubscribe: (() => void) | null = null;

    if (canViewAllProjects) {
      const q = query(collection(db, 'projects'), where('customerId', '==', currentUser.uid));
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const list: Project[] = [];
          snap.forEach((d) => {
            const data = d.data() as Project & { enabled?: boolean };
            if (data.enabled !== false) list.push({ ...data, id: d.id } as Project);
          });
          list.sort((a, b) => a.name.localeCompare(b.name));
          setProjects(list);
          setProjectsLoading(false);
        },
        () => setProjectsLoading(false)
      );
    } else if (loggedInProjectId) {
      unsubscribe = onSnapshot(
        doc(db, 'projects', loggedInProjectId),
        (d) => {
          const data = d.data() as (Project & { enabled?: boolean }) | undefined;
          if (d.exists() && data && data.customerId === currentUser.uid && data.enabled !== false) {
            setProjects([{ ...data, id: d.id } as Project]);
          } else setProjects([]);
          setProjectsLoading(false);
        },
        () => setProjectsLoading(false)
      );
    } else {
      const q = query(collection(db, 'projects'), where('customerId', '==', currentUser.uid));
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const list: Project[] = [];
          snap.forEach((d) => {
            const data = d.data() as Project & { enabled?: boolean };
            if (data.enabled !== false) list.push({ ...data, id: d.id } as Project);
          });
          list.sort((a, b) => a.name.localeCompare(b.name));
          setProjects(list);
          setProjectsLoading(false);
        },
        () => setProjectsLoading(false)
      );
    }
    return () => { if (unsubscribe) unsubscribe(); };
  }, [currentUser]);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar – exact match to reference: dark green gradient, logo block, white pill nav */}
      <div
        className={`
          flex flex-col h-screen text-white w-64 fixed left-0 top-0 z-50
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{
          background: 'linear-gradient(180deg, #163725 0%, #17402b 40%, #102318 100%)',
          boxShadow: '0 0 40px rgba(0,0,0,0.5)',
        }}
      >
      {/* Logo Section */}
      <div className="flex items-center px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center shadow-lg p-1.5 flex-shrink-0">
            <img src="/logo.png" alt="Grün Power Logo" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white leading-tight">Grün Power</h1>
            <p className="text-xs text-white/70">{t('navigation.customerPortal')}</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 py-5 space-y-2 overflow-y-auto">
        {/* Dashboard and S Gallery */}
        <div className="space-y-3">
          <Link
            href="/dashboard"
            onClick={() => { if (window.innerWidth < 1024) onClose(); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-full transition-all duration-200 ${
              pathname === '/' || pathname === '/dashboard' || pathname?.startsWith('/project/')
                ? 'bg-white text-green-power-700 shadow-[0_12px_32px_rgba(0,0,0,0.4)] font-semibold'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="text-xl">📊</span>
            <span className="text-sm">{t('navigation.dashboard')}</span>
          </Link>
          <Link
            href="/s-gallery"
            onClick={() => { if (window.innerWidth < 1024) onClose(); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-full transition-all duration-200 ${
              pathname === '/s-gallery' || pathname?.startsWith('/s-gallery')
                ? 'bg-white text-green-power-700 shadow-[0_12px_32px_rgba(0,0,0,0.4)] font-semibold'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="text-xl">🖼️</span>
            <span className="text-sm">{t('navigation.sGallery')}</span>
          </Link>

          {/* Project list below Dashboard */}
          {!projectsLoading && projects.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-white/60 tracking-[0.18em] uppercase px-2">
                {t('dashboard.myProjectsSection')}
              </p>
              {projects.map((project) => {
                const isProjectActive =
                  pathname === `/project/${project.id}` || pathname?.startsWith(`/project/${project.id}/`);
                const thumbUrl =
                  (project as Project & { thumbnailUrl?: string; imageUrl?: string }).thumbnailUrl?.trim() ||
                  (project as Project & { imageUrl?: string }).imageUrl?.trim() ||
                  '/desktop-bg.png';
                return (
                  <Link
                    key={project.id}
                    href={`/project/${project.id}`}
                    onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                    className="block px-2"
                  >
                    <div
                      className={`relative h-16 rounded-xl overflow-hidden shadow-md transition-all duration-200 ${
                        isProjectActive ? 'ring-2 ring-white/80 ring-offset-0' : 'hover:shadow-lg'
                      }`}
                    >
                      <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${thumbUrl})` }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent" />
                      <div className="relative h-full px-3 py-2 flex flex-col justify-center">
                        <span className="block text-xs font-medium text-white truncate">
                          {project.name}
                        </span>
                        {project.year != null && (
                          <span className="block text-[11px] text-white/80 truncate">
                            {t('dashboard.year')}: {project.year}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Divider line above customer profile */}
      <div className="flex-shrink-0 px-4">
        <hr className="border-t border-white/20" aria-hidden />
      </div>

      {/* User Info Footer – account card matching reference */}
      <div className="px-4 py-4">
        <Link
          href="/profile"
          onClick={() => { if (window.innerWidth < 1024) onClose(); }}
          className="block"
        >
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white text-green-power-800 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center ring-2 ring-white/80 flex-shrink-0"
              style={{
                background: 'linear-gradient(180deg, #7ab88a 0%, #5d8a6a 45%, #0d9488 100%)',
                boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset',
              }}
            >
              <span className="text-white font-semibold text-sm">
                {currentUser?.displayName?.charAt(0).toUpperCase() ||
                  currentUser?.email?.charAt(0).toUpperCase() ||
                  'C'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">
                {currentUser?.displayName ||
                  currentUser?.email?.split('@')[0] ||
                  `Customer ${currentUser?.uid?.slice(0, 8) || ''}`}
              </p>
              <p className="text-[11px] text-gray-500">{t('profile.customerAccount')}</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
    </>
  );
}

