'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isNativeIOSApp, nativeOneSignalLogin, nativeOneSignalLogout } from '@/lib/nativeApp';

function getOS(): { login: (id: string) => Promise<void>; logout: () => Promise<void> } | null {
  return typeof window !== 'undefined' ? (window as Window & { OneSignal?: { login: (id: string) => Promise<void>; logout: () => Promise<void> } }).OneSignal ?? null : null;
}

function deferOS(fn: (os: NonNullable<ReturnType<typeof getOS>>) => void): void {
  if (typeof window === 'undefined') return;
  (window as Window & { OneSignalDeferred?: Array<(os: NonNullable<ReturnType<typeof getOS>>) => void> }).OneSignalDeferred =
    (window as Window & { OneSignalDeferred?: Array<(os: NonNullable<ReturnType<typeof getOS>>) => void> }).OneSignalDeferred || [];
  (window as Window & { OneSignalDeferred?: Array<(os: NonNullable<ReturnType<typeof getOS>>) => void> }).OneSignalDeferred!.push(fn);
}

export default function OneSignalProvider() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser?.uid) return;

    if (isNativeIOSApp()) {
      nativeOneSignalLogin(currentUser.uid);
      console.log('[OneSignal] Native login bridged:', currentUser.uid);
      return;
    }

    const tag = (OneSignal: NonNullable<ReturnType<typeof getOS>>) => {
      OneSignal.login(currentUser.uid)
        .then(() => console.log('[OneSignal] External user ID set:', currentUser.uid))
        .catch((e: unknown) => console.warn('[OneSignal] login() error:', e));
    };

    const OS = getOS();
    if (OS) {
      tag(OS);
    } else {
      deferOS(tag);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    if (currentUser) return;

    if (isNativeIOSApp()) {
      nativeOneSignalLogout();
      return;
    }

    const OS = getOS();
    if (OS) {
      OS.logout().catch(() => {});
    }
  }, [currentUser]);

  return null;
}
