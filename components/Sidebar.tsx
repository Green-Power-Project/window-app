'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  name: string;
  href: string;
  icon: string;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { currentUser } = useAuth();

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-green-power-700 to-green-power-800 text-white w-64 fixed left-0 top-0 z-40 shadow-2xl">
      {/* Logo Section */}
      <div className="flex items-center px-6 py-5 border-b border-green-power-600/30">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-lg">
            <span className="text-2xl">🌿</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Green Power</h1>
            <p className="text-xs text-green-power-200">Customer Portal</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          // Check if this specific item is active
          const isItemActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          
          // Check if any other navigation item is active
          const isOtherItemActive = navigation.some(otherItem => 
            otherItem.name !== item.name && 
            (pathname === otherItem.href || pathname?.startsWith(otherItem.href + '/'))
          );
          
          // Dashboard should be active by default unless another tab is explicitly selected
          // For Dashboard specifically, also make it active on root and project pages
          const isActive = isItemActive || 
            (item.name === 'Dashboard' && !isOtherItemActive && (pathname === '/' || pathname?.startsWith('/project/')));
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200
                ${
                  isActive
                    ? 'bg-white text-green-power-700 shadow-lg font-semibold'
                    : 'text-green-power-100 hover:bg-green-power-700/50 hover:text-white'
                }
              `}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Info Footer */}
      <div className="px-4 py-4 border-t border-green-power-600/30">
        <div className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-green-power-700/30">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
            <span className="text-green-power-700 font-semibold text-sm">
              {currentUser?.displayName?.charAt(0).toUpperCase() || 
               currentUser?.email?.charAt(0).toUpperCase() || 
               'C'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">
              {currentUser?.displayName || 
               currentUser?.email?.split('@')[0] || 
               `Customer ${currentUser?.uid?.slice(0, 8) || ''}`}
            </p>
            <p className="text-xs text-green-power-200">Customer</p>
          </div>
        </div>
      </div>
    </div>
  );
}

