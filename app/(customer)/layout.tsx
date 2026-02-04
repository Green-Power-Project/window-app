'use client';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LayoutTitleProvider } from '@/contexts/LayoutTitleContext';
import CustomerLayout from '@/components/CustomerLayout';

/** Persistent layout for all customer portal routes. Sidebar + header stay mounted; only main content changes. */
export default function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <LayoutTitleProvider>
        <CustomerLayout>{children}</CustomerLayout>
      </LayoutTitleProvider>
    </ProtectedRoute>
  );
}
