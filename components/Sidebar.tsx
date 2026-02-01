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
      
      {/* Sidebar */}
      <div className={`
        flex flex-col h-screen bg-gradient-to-b from-green-power-700 to-green-power-800 text-white 
        w-64 fixed left-0 top-0 z-50 shadow-2xl
        transform transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
      {/* Logo Section */}
      <div className="flex items-center px-6 py-5 border-b border-green-power-600/30">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-lg p-1.5">
            <img src="/logo.png" alt="Grün Power Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Grün Power</h1>
            <p className="text-xs text-green-power-200">{t('navigation.customerPortal')}</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          if (item.href === '/profile') {
            // Render Dashboard first, then projects list, then Profile
            const isDashboardActive = pathname === '/' || pathname === '/dashboard' || pathname?.startsWith('/project/');
            const isProfileActive = pathname === '/profile' || pathname?.startsWith('/profile/');
            return (
              <div key="nav-with-projects" className="space-y-1">
                <Link
                  href="/dashboard"
                  onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isDashboardActive && !isProfileActive ? 'bg-white text-green-power-700 shadow-lg font-semibold' : 'text-green-power-100 hover:bg-green-power-700/50 hover:text-white'
                  }`}
                >
                  <span className="text-xl">📊</span>
                  <span className="text-sm">{t('navigation.dashboard')}</span>
                </Link>
                {/* Project list below Dashboard */}
                {!projectsLoading && projects.length > 0 && (
                  <div className="pl-4 ml-2 border-l-2 border-green-power-600/40 space-y-0.5">
                    <p className="text-xs font-medium text-green-power-200 uppercase tracking-wide px-2 py-1.5">{t('dashboard.myProjectsSection')}</p>
                    {projects.map((project) => {
                      const isProjectActive = pathname === `/project/${project.id}` || pathname?.startsWith(`/project/${project.id}/`);
                      return (
                        <Link
                          key={project.id}
                          href={`/project/${project.id}`}
                          onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                          className={`block px-3 py-2 rounded-md text-sm transition-all duration-200 ${
                            isProjectActive ? 'bg-white/20 text-white font-medium' : 'text-green-power-100 hover:bg-green-power-700/50 hover:text-white'
                          }`}
                        >
                          <span className="block truncate">{project.name}</span>
                          {project.year != null && <span className="block text-xs opacity-80 truncate">{t('dashboard.year')}: {project.year}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
                <Link
                  href={item.href}
                  onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isProfileActive ? 'bg-white text-green-power-700 shadow-lg font-semibold' : 'text-green-power-100 hover:bg-green-power-700/50 hover:text-white'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-sm">{item.name}</span>
                </Link>
              </div>
            );
          }
          return null;
        })}
      </nav>

      {/* User Info Footer */}
      <div className="px-4 py-4 border-t border-green-power-600/30">
        <div className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-green-power-700/30">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
            <span className="text-green-power-700 font-semibold text-sm">
              {currentUser?.displayName?.charAt(0).toUpperCase() || 
               currentUser?.email?.charAt(0).toUpperCase() || 
               'C'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">
              {currentUser?.displayName || 
               currentUser?.email?.split('@')[0] || 
               `Customer ${currentUser?.uid?.slice(0, 8) || ''}`}
            </p>
            <p className="text-xs text-green-power-200">{t('profile.customerAccount')}</p>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

