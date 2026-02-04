'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLayoutTitle } from '@/contexts/LayoutTitleContext';
import ProfileContent from '@/components/ProfileContent';

export default function ProfilePage() {
  const { t } = useLanguage();
  const { setTitle } = useLayoutTitle();

  useEffect(() => {
    setTitle(t('profile.title'));
    return () => setTitle(null);
  }, [t, setTitle]);

  return (
    <div className="relative min-h-screen w-full">
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-[0.5]"
        style={{ backgroundImage: 'url(/desktop-bg.png)' }}
        aria-hidden
      />
      <div className="relative z-10 min-h-full">
        <ProfileContent />
      </div>
    </div>
  );
}
