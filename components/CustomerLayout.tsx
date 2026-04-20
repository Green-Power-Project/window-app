'use client';

import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import AppHeader from './AppHeader';
import { useLayoutTitle } from '@/contexts/LayoutTitleContext';

interface CustomerLayoutProps {
  children: React.ReactNode;
}

export default function CustomerLayout({ children }: CustomerLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { title } = useLayoutTitle();

  // Close sidebar when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-[100dvh] min-h-0 max-h-[100dvh] bg-gray-50 sm:min-h-screen sm:max-h-none sm:h-screen">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col lg:ml-64 overflow-hidden min-w-0 min-h-0">
        <AppHeader title={title ?? undefined} onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 min-h-0 min-w-0 max-w-full overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth pb-[max(0.75rem,env(safe-area-inset-bottom))] touch-pan-y">
          {children}
        </main>
      </div>
    </div>
  );
}

