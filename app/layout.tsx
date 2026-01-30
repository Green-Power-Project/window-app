import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from './providers';
import InstallPrompt from '@/components/InstallPrompt';

export const metadata: Metadata = {
  title: 'AppGrün Power - Customer Portal',
  description: 'AppGrün Power Customer Portal - Manage your account and services',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'AppGrün Power',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#5d7a5d',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/196.png" />
        <link rel="apple-touch-icon" href="/180.png" />
        <meta name="theme-color" content="#5d7a5d" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="AppGrün Power" />
        <meta name="mobile-web-app-capable" content="yes" />
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

