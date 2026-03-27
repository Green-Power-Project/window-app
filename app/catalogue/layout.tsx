'use client';

import PublicLayoutShell from '@/components/PublicLayoutShell';

/** Same shell as (public) routes; kept separate so /catalogue chunks omit "(public)" in paths. */
export default function CatalogueLayout({ children }: { children: React.ReactNode }) {
  return <PublicLayoutShell>{children}</PublicLayoutShell>;
}
