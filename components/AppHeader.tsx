'use client';

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
  const { language, setLanguage, t } = useLanguage();

  async function handleLogout() {
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
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
      <div className="lg:ml-0 px-4 sm:px-6">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Hamburger Menu Button - Mobile Only */}
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-green-power-500"
              aria-label="Toggle menu"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="hidden sm:flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm p-1.5">
                <img src="/logo.png" alt="AppGrün Power Logo" className="w-full h-full object-contain" />
              </div>
              {title && (
                <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
              )}
            </div>
            {title && (
              <h1 className="text-lg font-semibold text-gray-900 sm:hidden">{title}</h1>
            )}
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/80 p-1">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  language === 'en'
                    ? 'bg-green-power-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                🇬🇧 {t('profile.english')}
              </button>
              <button
                type="button"
                onClick={() => setLanguage('de')}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  language === 'de'
                    ? 'bg-green-power-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                🇩🇪 {t('profile.german')}
              </button>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-green-power-500 to-green-power-600 rounded-full flex items-center justify-center shadow-md">
                <span className="text-white font-semibold text-xs sm:text-sm">
                  {currentUser?.displayName?.charAt(0).toUpperCase() || 
                   currentUser?.email?.charAt(0).toUpperCase() || 
                   'C'}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {currentUser?.displayName || 
                   currentUser?.email?.split('@')[0] || 
                   `Customer ${currentUser?.uid?.slice(0, 8) || ''}`}
                </p>
                <p className="text-xs text-gray-500">{t('common.customerRole')}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm text-white bg-gradient-to-r from-green-power-600 to-green-power-700 hover:from-green-power-700 hover:to-green-power-800 rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200"
            >
              <span className="hidden sm:inline">{t('common.signOut')}</span>
              <span className="sm:hidden">{t('common.signOut')}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

