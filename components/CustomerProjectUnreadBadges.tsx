'use client';

import UnreadBadge from '@/components/UnreadBadge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCustomerProjectUnreadSummary } from '@/hooks/useCustomerProjectUnreadSummary';

/**
 * Shows folder unread and chat unread as two separate badges (not a combined total).
 */
export default function CustomerProjectUnreadBadges({
  projectId,
  customFolders = [],
  dynamicSubfolders,
  size = 'md',
}: {
  projectId: string;
  customFolders?: string[];
  dynamicSubfolders?: Record<string, string[]>;
  size?: 'sm' | 'md';
}) {
  const { t } = useLanguage();
  const { chatUnread, folderUnread, loading } = useCustomerProjectUnreadSummary(
    projectId,
    customFolders,
    dynamicSubfolders
  );

  if (loading) return null;
  if (folderUnread <= 0 && chatUnread <= 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {folderUnread > 0 && (
        <span
          title={t('dashboard.unreadProjectFiles')}
          aria-label={`${t('dashboard.unreadProjectFiles')}: ${folderUnread}`}
        >
          <UnreadBadge count={folderUnread} size={size} variant="folder" />
        </span>
      )}
      {chatUnread > 0 && (
        <span
          title={t('dashboard.unreadChat')}
          aria-label={`${t('dashboard.unreadChat')}: ${chatUnread}`}
        >
          <UnreadBadge count={chatUnread} size={size} variant="chat" />
        </span>
      )}
    </div>
  );
}
