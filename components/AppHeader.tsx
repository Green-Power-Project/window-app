'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface AppHeaderProps {
  title?: string;
}

export default function AppHeader({ title }: AppHeaderProps) {
  const { currentUser, logout } = useAuth();
  const router = useRouter();

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
      <div className="ml-64 px-6">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            {title && (
              <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 bg-gradient-to-br from-green-power-500 to-green-power-600 rounded-full flex items-center justify-center shadow-md">
                <span className="text-white font-semibold text-sm">
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
                <p className="text-xs text-gray-500">Customer</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-white bg-gradient-to-r from-green-power-600 to-green-power-700 hover:from-green-power-700 hover:to-green-power-800 rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

