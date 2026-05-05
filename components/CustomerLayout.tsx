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
  const [forceMobileLayout, setForceMobileLayout] = useState(false);
  const { title } = useLayoutTitle();

  useEffect(() => {
    const detectPhoneLikeDevice = () => {
      if (typeof window === 'undefined') return false;
      const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const hasTouch = navigator.maxTouchPoints > 0 || hasCoarsePointer;
      const shortestSide = Math.min(window.screen.width || 0, window.screen.height || 0);
      // Keep mobile layout on real handheld touch devices even when "Desktop site" is enabled.
      return hasTouch && shortestSide > 0 && shortestSide <= 600;
    };
    setForceMobileLayout(detectPhoneLikeDevice());
  }, []);

  // Close sidebar when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (!forceMobileLayout && window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [forceMobileLayout]);

  return (
    <div className="flex h-[100dvh] min-h-0 max-h-[100dvh] bg-gray-50 sm:min-h-screen sm:max-h-none sm:h-screen">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        forceMobileLayout={forceMobileLayout}
      />
      <div
        className={`flex-1 flex flex-col overflow-hidden min-w-0 min-h-0 ${
          forceMobileLayout ? '' : 'lg:ml-64'
        }`}
      >
        <AppHeader
          title={title ?? undefined}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          forceMobileLayout={forceMobileLayout}
        />
        <main className="flex-1 min-h-0 min-w-0 max-w-full overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth pb-[max(0.75rem,env(safe-area-inset-bottom))] touch-pan-y">
          {children}
        </main>
      </div>
      {process.env.NODE_ENV !== 'production' && forceMobileLayout && (
        <div className="fixed bottom-2 right-2 z-[100] rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-white pointer-events-none">
          mobile-layout-lock
        </div>
      )}
    </div>
  );
}

