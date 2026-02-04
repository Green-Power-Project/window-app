'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLayoutTitle } from '@/contexts/LayoutTitleContext';
import DashboardContent from '@/components/DashboardContent';

export default function DashboardPage() {
  const { t } = useLanguage();
  const { setTitle } = useLayoutTitle();

  useEffect(() => {
    setTitle(t('navigation.dashboard'));
    return () => setTitle(null);
  }, [t, setTitle]);

  return <DashboardContent />;
}
