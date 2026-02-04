'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

interface AppHeaderProps {
  title?: string;
  onMenuClick: () => void;
}

export default function AppHeader({ title, onMenuClick }: AppHeaderProps) {
  const { currentUser, logout } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();
  const [showSignOutAlert, setShowSignOutAlert] = useState(false);

  async function handleLogout() {
    setShowSignOutAlert(false);
    try {
      await logout();
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }
      router.push('/login');
    } catch (error) {
      console.error('Error logging out:', error);
      router.push('/login');
    }
  }

  return (
    <>
    <header
      className="sticky top-0 z-30 border-b border-white/70 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(246,241,233,0.9) 100%)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="lg:ml-0 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 sm:h-[72px]">
          {/* Left: section icon + title */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-green-power-500"
              aria-label="Toggle menu"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="hidden sm:flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white shadow-md flex items-center justify-center">
                <span className="text-xl">📊</span>
              </div>
              {title && (
                <h1 className="font-display text-lg sm:text-xl font-semibold text-gray-900">{title}</h1>
              )}
            </div>
            {title && (
              <h1 className="font-display text-lg font-bold text-gray-900 sm:hidden">{title}</h1>
            )}
          </div>
          {/* Right: customer badge + sign out */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shadow-md ring-2 ring-white/90 flex-shrink-0"
                style={{
                  background: 'linear-gradient(180deg, #7ab88a 0%, #5d8a6a 45%, #0d9488 100%)',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset, 0 2px 8px rgba(72, 164, 127, 0.35)',
                }}
              >
                <span className="text-white font-semibold text-sm">
                  {currentUser?.displayName?.charAt(0).toUpperCase() ||
                    currentUser?.email?.charAt(0).toUpperCase() ||
                    'C'}
                </span>
              </div>
              <div className="hidden sm:block min-w-0">
                <p className="text-sm font-medium text-gray-900 leading-tight truncate">
                  {currentUser?.displayName ||
                    currentUser?.email?.split('@')[0] ||
                    `Customer ${currentUser?.uid?.slice(0, 8) || ''}`}
                </p>
                <p className="text-xs text-gray-500">{t('common.customerRole')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSignOutAlert(true)}
              className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-full font-medium shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
            >
              {t('common.signOut')}
            </button>
          </div>
        </div>
      </div>
    </header>

      {/* Sign out confirmation popup */}
      {showSignOutAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowSignOutAlert(false)} aria-hidden>
          <div
            className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <p className="text-gray-800 font-medium text-center">{t('common.signOutConfirmMessage')}</p>
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button
                type="button"
                onClick={() => setShowSignOutAlert(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors"
              >
                {t('common.signOut')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

