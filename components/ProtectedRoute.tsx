'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/login');
    }
  }, [currentUser, loading, router]);

  /* When loading, still render children (layout + content) to avoid post-login blink.
   * Only hide content when we know user is not logged in. */
  if (!loading && !currentUser) {
    return null;
  }

  return <>{children}</>;
}

