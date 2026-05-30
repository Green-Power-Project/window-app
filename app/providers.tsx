'use client';

import dynamic from 'next/dynamic';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';

const OneSignalProvider = dynamic(() => import('@/components/OneSignalProvider'), { ssr: false });

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LanguageProvider>
        {children}
        <OneSignalProvider />
      </LanguageProvider>
    </AuthProvider>
  );
}
