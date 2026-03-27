'use client';

import PublicLayoutShell from '@/components/PublicLayoutShell';

/**
 * Shared layout for login, gallery, offer, etc. Catalogue lives under app/catalogue
 * so production chunk URLs avoid parentheses (some reverse proxies return 400 for them).
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicLayoutShell>{children}</PublicLayoutShell>;
}
