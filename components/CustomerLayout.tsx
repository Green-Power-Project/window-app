'use client';

import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import AppHeader from './AppHeader';
import { useLanguage } from '@/contexts/LanguageContext';

interface CustomerLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function CustomerLayout({ children, title }: CustomerLayoutProps) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-600">{t('common.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-64 overflow-hidden">
        <AppHeader title={title} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

