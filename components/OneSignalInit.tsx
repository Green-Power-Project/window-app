'use client';

import { useEffect } from 'react';
import { isNativeIOSApp } from '@/lib/nativeApp';

const ONE_SIGNAL_APP_ID = '66bad4a7-c406-47b4-bd16-4e961d18988a';

type OneSignalWebSDK = {
  init: (opts: Record<string, unknown>) => Promise<void>;
  Notifications: {
    permissionNative: string;
    requestPermission: () => Promise<void>;
    addEventListener: (event: string, cb: (event: unknown) => void) => void;
  };
  User?: { PushSubscription?: { id?: string } };
};

export default function OneSignalInit() {
  useEffect(() => {
    if (isNativeIOSApp()) {
      console.log('[OneSignal] Native iOS app — web SDK skipped (native SDK handles push)');
      return;
    }

    (window as Window & { OneSignalDeferred?: Array<(os: OneSignalWebSDK) => void> }).OneSignalDeferred =
      (window as Window & { OneSignalDeferred?: Array<(os: OneSignalWebSDK) => void> }).OneSignalDeferred || [];

    const script = document.createElement('script');
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.defer = true;
    script.async = true;
    document.head.appendChild(script);

    (window as Window & { OneSignalDeferred?: Array<(os: OneSignalWebSDK) => void> }).OneSignalDeferred!.push(
      async function (OneSignal: {
        init: (opts: Record<string, unknown>) => Promise<void>;
        Notifications: {
          permissionNative: string;
          requestPermission: () => Promise<void>;
          addEventListener: (event: string, cb: (event: unknown) => void) => void;
        };
        User?: { PushSubscription?: { id?: string } };
      }) {
        await OneSignal.init({
          appId: ONE_SIGNAL_APP_ID,
          serviceWorkerPath: '/OneSignalSDKWorker.js',
          serviceWorkerUpdaterPath: '/OneSignalSDKUpdaterWorker.js',
          notifyButton: { enable: false },
        });
        console.log('[OneSignal] Initialized. Permission:', OneSignal.Notifications.permissionNative);
        const subId = OneSignal.User?.PushSubscription?.id;
        if (subId) console.log('[OneSignal] Subscription ID:', subId);
        if (OneSignal.Notifications.permissionNative === 'default') {
          await OneSignal.Notifications.requestPermission();
          console.log('[OneSignal] Permission after prompt:', OneSignal.Notifications.permissionNative);
          const newSubId = OneSignal.User?.PushSubscription?.id;
          if (newSubId) console.log('[OneSignal] Subscription ID after grant:', newSubId);
        }
        OneSignal.Notifications.addEventListener('click', (event: unknown) => {
          const e = event as { notification?: { launchURL?: string } };
          console.log('[OneSignal] Notification clicked. URL:', e?.notification?.launchURL);
        });
      }
    );
  }, []);

  return null;
}
