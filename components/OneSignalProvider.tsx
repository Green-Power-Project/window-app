'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

function getOS(): any {
  return typeof window !== 'undefined' ? (window as any).OneSignal : null;
}

function deferOS(fn: (os: any) => void): void {
  if (typeof window === 'undefined') return;
  (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];
  (window as any).OneSignalDeferred.push(fn);
}

export default function OneSignalProvider() {
  const { currentUser } = useAuth();

  // Tag the user in OneSignal with their Firebase UID when they log in
  useEffect(() => {
    if (!currentUser?.uid) return;

    const tag = (OneSignal: any) => {
      if (!OneSignal) return;
      OneSignal.login(currentUser.uid)
        .then(() => console.log('[OneSignal] External user ID set:', currentUser.uid))
        .catch((e: any) => console.warn('[OneSignal] login() error:', e));
    };

    const OS = getOS();
    if (OS) {
      tag(OS);
    } else {
      deferOS(tag);
    }
  }, [currentUser?.uid]);

  // Clear OneSignal user on logout
  useEffect(() => {
    if (currentUser) return;
    const OS = getOS();
    if (OS) {
      OS.logout().catch(() => {});
    }
  }, [currentUser]);

  return null;
}
