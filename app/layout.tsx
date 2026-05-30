import type { Metadata, Viewport } from 'next';
import dynamic from 'next/dynamic';
import './globals.css';
import Providers from './providers';

const InstallPrompt = dynamic(() => import('@/components/InstallPrompt'), { ssr: false });

export const metadata: Metadata = {
  title: 'Grün Power - Customer Portal',
  description: 'Grün Power Customer Portal - Manage your account and services',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Grün Power',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#5d7a5d',
  /** Android / PWA: viewport resizes when virtual keyboard opens (better form UX). */
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/196.png" />
        <link rel="apple-touch-icon" href="/180.png" />
        <meta name="theme-color" content="#5d7a5d" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Grün Power" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* OneSignal Web Push SDK */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer={true} async={true} />
        <script dangerouslySetInnerHTML={{ __html: `
          window.OneSignalDeferred = window.OneSignalDeferred || [];
          OneSignalDeferred.push(async function(OneSignal) {
            await OneSignal.init({
              appId: "66bad4a7-c406-47b4-bd16-4e961d18988a",
              serviceWorkerPath: "/OneSignalSDKWorker.js",
              serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
              notifyButton: { enable: false },
            });
            console.log('[OneSignal] Initialized. Permission:', OneSignal.Notifications.permissionNative);
            var subId = OneSignal.User && OneSignal.User.PushSubscription && OneSignal.User.PushSubscription.id;
            if (subId) console.log('[OneSignal] Subscription ID:', subId);
            if (OneSignal.Notifications.permissionNative === 'default') {
              await OneSignal.Notifications.requestPermission();
              console.log('[OneSignal] Permission after prompt:', OneSignal.Notifications.permissionNative);
              var newSubId = OneSignal.User && OneSignal.User.PushSubscription && OneSignal.User.PushSubscription.id;
              if (newSubId) console.log('[OneSignal] Subscription ID after grant:', newSubId);
            }
            OneSignal.Notifications.addEventListener('click', function(event) {
              console.log('[OneSignal] Notification clicked. URL:', event && event.notification && event.notification.launchURL);
            });
          });
        `}} />
      </head>
      <body>
        <Providers>
          {children}
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}

