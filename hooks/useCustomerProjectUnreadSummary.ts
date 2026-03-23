'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToMessages } from '@/lib/chatRealtimeService';
import type { ChatMessage } from '@/lib/chatRealtimeTypes';
import { countUnreadChatForCustomer } from '@/lib/chatUnreadUtils';
import { computeCustomerTotalFolderUnread } from '@/lib/projectFolderUnreadCustomer';

export interface CustomerProjectUnreadSummary {
  chatUnread: number;
  folderUnread: number;
  total: number;
  loading: boolean;
}

/**
 * Live unread counts for a project (customer): chat + folder files.
 */
export function useCustomerProjectUnreadSummary(
  projectId: string | null | undefined,
  customFolders: string[] = [],
  dynamicSubfolders?: Record<string, string[]>
): CustomerProjectUnreadSummary {
  const { currentUser } = useAuth();
  const [chatUnread, setChatUnread] = useState(0);
  const [folderUnread, setFolderUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const customFoldersKey = JSON.stringify(customFolders ?? []);
  const dynamicSubfoldersKey = JSON.stringify(dynamicSubfolders ?? {});

  const refreshFolders = useCallback(async () => {
    if (!projectId || !currentUser?.uid || !db) {
      setFolderUnread(0);
      setLoading(false);
      return;
    }
    try {
      const folders: string[] = JSON.parse(customFoldersKey);
      const dynamic: Record<string, string[]> | undefined =
        dynamicSubfoldersKey === '{}' ? undefined : JSON.parse(dynamicSubfoldersKey);
      const total = await computeCustomerTotalFolderUnread(
        projectId,
        currentUser.uid,
        folders,
        dynamic
      );
      setFolderUnread(total);
    } catch (e) {
      console.error('computeCustomerTotalFolderUnread', e);
      setFolderUnread(0);
    } finally {
      setLoading(false);
    }
  }, [projectId, currentUser?.uid, customFoldersKey, dynamicSubfoldersKey]);

  useEffect(() => {
    if (!projectId) {
      setChatUnread(0);
      setFolderUnread(0);
      setLoading(false);
      return undefined;
    }
    const unsubChat = subscribeToMessages(projectId, (messages: ChatMessage[]) => {
      setChatUnread(countUnreadChatForCustomer(messages));
    });
    return () => unsubChat();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !currentUser?.uid || !db) {
      setFolderUnread(0);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    refreshFolders();
    const q = query(
      collection(db, 'fileReadStatus'),
      where('projectId', '==', projectId),
      where('customerId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(
      q,
      () => {
        refreshFolders();
      },
      (err) => {
        console.error('fileReadStatus listener', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [projectId, currentUser?.uid, refreshFolders, customFoldersKey, dynamicSubfoldersKey]);

  const total = chatUnread + folderUnread;

  return { chatUnread, folderUnread, total, loading };
}
