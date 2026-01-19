'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AppHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
  showUserInfo?: boolean;
}

export default function AppHeader({ breadcrumbs, showUserInfo = true }: AppHeaderProps) {
  const { currentUser, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    try {
      await logout();
      // Clear any local storage/session data if needed
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }
      router.push('/login');
    } catch (error) {
      console.error('Error logging out:', error);
      // Still redirect even if logout fails
      router.push('/login');
    }
  }

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center h-14">
          <div className="flex items-center flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 tracking-tight">
              Green Power
            </h1>
            <span className="ml-3 text-xs text-gray-500 font-normal hidden sm:inline">
              Customer Portal
            </span>
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav className="ml-6 hidden md:flex items-center space-x-2 text-xs text-gray-500">
                {breadcrumbs.map((crumb, index) => (
                  <span key={index} className="flex items-center">
                    {index > 0 && <span className="mx-2">/</span>}
                    {crumb.href ? (
                      <Link
                        href={crumb.href}
                        className="hover:text-gray-900"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-gray-900">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
          </div>
          {showUserInfo && (
            <div className="flex items-center space-x-4">
              <span className="text-xs text-gray-600 hidden sm:inline">
                {currentUser?.displayName || `Customer ${currentUser?.uid.slice(0, 8)}`}
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs text-gray-700 hover:text-gray-900 border border-gray-300 rounded-sm hover:bg-gray-50 font-medium"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

