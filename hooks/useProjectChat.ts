'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  subscribeToMessages,
  subscribeToAdminTyping,
  subscribeToLastSeen,
  updateCustomerLastSeen,
  markMessagesAsRead,
  setCustomerTyping,
  sendMessage as sendMessageService,
  uploadChatFile,
} from '@/lib/chatRealtimeService';
import type { ChatMessage, ReplyRef } from '@/lib/chatRealtimeTypes';

const TYPING_THROTTLE_MS = 2000;

export function useProjectChat(projectId: string | null, isOpen: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoadError, setMessagesLoadError] = useState<string | null>(null);
  const [adminTyping, setAdminTyping] = useState(false);
  const [lastSeenAdmin, setLastSeenAdmin] = useState<number | null>(null);
  const [lastSeenCustomer, setLastSeenCustomer] = useState<number | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const readReceiptDoneRef = useRef(false);
  const markedReadThisOpenRef = useRef(false);
  const typingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingUpdateRef = useRef(0);

  useEffect(() => {
    if (!projectId) {
      setMessages([]);
      setMessagesLoadError(null);
      return undefined;
    }
    setMessagesLoadError(null);
    const unsub = subscribeToMessages(
      projectId,
      (list) => {
        setMessagesLoadError(null);
        setMessages(list);
      },
      (err) => {
        setMessagesLoadError(err.message || 'PERMISSION_DENIED');
      }
    );
    return () => unsub();
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setAdminTyping(false);
      return undefined;
    }
    const unsub = subscribeToAdminTyping(projectId, setAdminTyping);
    return () => unsub();
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLastSeenAdmin(null);
      setLastSeenCustomer(null);
      return undefined;
    }
    const unsub = subscribeToLastSeen(projectId, (admin, customer) => {
      setLastSeenAdmin(admin);
      setLastSeenCustomer(customer);
    });
    return () => unsub();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !isOpen) {
      readReceiptDoneRef.current = false;
      markedReadThisOpenRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await updateCustomerLastSeen(projectId);
        if (cancelled) return;
        readReceiptDoneRef.current = true;
      } catch (e) {
        console.error('updateCustomerLastSeen failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, isOpen]);

  // When chat is open and messages are loaded, mark other party's unread messages as read (once per open). Run independently so we don't wait for lastSeen update.
  useEffect(() => {
    if (!projectId || !isOpen || markedReadThisOpenRef.current || messages.length === 0) return;
    const toMark = messages
      .filter((m) => m.senderType === 'admin' && m.status === 'sent')
      .map((m) => m.messageId);
    if (toMark.length === 0) return;
    markedReadThisOpenRef.current = true;
    markMessagesAsRead(projectId, toMark).catch((e) => console.error('markMessagesAsRead failed', e));
  }, [projectId, isOpen, messages]);

  const setTypingThrottled = useCallback(
    (isTyping: boolean) => {
      if (!projectId) return;
      const now = Date.now();
      if (isTyping) {
        if (now - lastTypingUpdateRef.current >= TYPING_THROTTLE_MS) {
          lastTypingUpdateRef.current = now;
          setCustomerTyping(projectId, true).catch(() => {});
        } else {
          if (!typingThrottleRef.current) {
            typingThrottleRef.current = setTimeout(() => {
              typingThrottleRef.current = null;
              lastTypingUpdateRef.current = Date.now();
              setCustomerTyping(projectId, true).catch(() => {});
            }, TYPING_THROTTLE_MS - (now - lastTypingUpdateRef.current));
          }
        }
      } else {
        if (typingThrottleRef.current) {
          clearTimeout(typingThrottleRef.current);
          typingThrottleRef.current = null;
        }
        lastTypingUpdateRef.current = now;
        setCustomerTyping(projectId, false).catch(() => {});
      }
    },
    [projectId]
  );

  useEffect(() => {
    return () => {
      if (typingThrottleRef.current) clearTimeout(typingThrottleRef.current);
      if (projectId) setCustomerTyping(projectId, false).catch(() => {});
    };
  }, [projectId]);

  const sendMessage = useCallback(
    async (
      senderId: string,
      text: string | null,
      fileUrl: string | null,
      fileType: string | null,
      replyTo: ReplyRef | null
    ) => {
      if (!projectId) return;
      setSendError(null);
      setSending(true);
      try {
        await sendMessageService(projectId, senderId, 'customer', {
          text: text || null,
          fileUrl,
          fileType,
          replyTo,
        });
      } catch (e) {
        setSendError(e instanceof Error ? e.message : 'Failed to send');
      } finally {
        setSending(false);
      }
    },
    [projectId]
  );

  const uploadFile = useCallback(
    async (file: File): Promise<{ url: string; fileType: string } | null> => {
      if (!projectId) return null;
      setUploading(true);
      setSendError(null);
      try {
        return await uploadChatFile(projectId, file);
      } catch (e) {
        setSendError(e instanceof Error ? e.message : 'Upload failed');
        return null;
      } finally {
        setUploading(false);
      }
    },
    [projectId]
  );

  return {
    messages,
    messagesLoadError,
    adminTyping,
    lastSeenAdmin,
    lastSeenCustomer,
    sendMessage,
    uploadFile,
    setTypingThrottled,
    sendError,
    sending,
    uploading,
  };
}
