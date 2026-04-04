/**
 * Chat service: Firebase Realtime Database for messages; file attachments use VPS disk via /api/storage/upload.
 * No Firestore. One write per message; read receipt only when chat opens; typing throttled by caller.
 */

import {
  ref,
  push,
  set,
  update,
  get,
  onValue,
  Unsubscribe,
} from 'firebase/database';
import { realtimeDb } from '@/lib/firebase';
import type {
  ChatMessage,
  MessagePayload,
  MessageStatus,
  ReplyRef,
  SenderType,
} from './chatRealtimeTypes';
import {
  messagesPath,
  messagePath,
  typingPath,
  lastSeenPath,
  MESSAGE_LIMIT,
} from './chatRealtimeTypes';

/** Accept number or numeric string (legacy / manual DB edits). */
function parseCreatedAtMs(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readMessageFromSnapshot(messageId: string, data: Record<string, unknown>): ChatMessage | null {
  if (!data) return null;
  const createdAt = parseCreatedAtMs(data.createdAt);
  if (createdAt == null) return null;
  return {
    messageId,
    senderId: String(data.senderId ?? ''),
    senderType: (data.senderType === 'customer' ? 'customer' : 'admin') as SenderType,
    text: data.text != null ? String(data.text) : null,
    fileUrl: data.fileUrl != null ? String(data.fileUrl) : null,
    fileType: data.fileType != null ? String(data.fileType) : null,
    createdAt,
    status: (data.status === 'read' ? 'read' : 'sent') as MessageStatus,
    replyTo: parseReplyTo(data.replyTo),
    editedAt: data.editedAt != null ? Number(data.editedAt) : null,
  };
}

function parseReplyTo(v: unknown): ReplyRef | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const messageId = o.messageId != null ? String(o.messageId) : '';
  if (!messageId) return null;
  return {
    messageId,
    text: o.text != null ? String(o.text) : null,
    fileType: o.fileType != null ? String(o.fileType) : null,
  };
}

/**
 * Subscribe to all messages for a project. Uses a single `onValue` on `.../messages`
 * (no composite query) so reads match typical RTDB rules; last N are kept client-side.
 */
export function subscribeToMessages(
  projectId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!realtimeDb) {
    onMessages([]);
    return () => {};
  }
  const messagesRef = ref(realtimeDb, messagesPath(projectId));
  const unsubscribe = onValue(
    messagesRef,
    (snapshot) => {
      const val = snapshot.val();
      const list: ChatMessage[] = [];
      if (val && typeof val === 'object') {
        const entries = Object.entries(val) as [string, Record<string, unknown>][];
        entries.sort((a, b) => {
          const ta = parseCreatedAtMs(a[1].createdAt) ?? 0;
          const tb = parseCreatedAtMs(b[1].createdAt) ?? 0;
          return ta - tb;
        });
        for (const [id, data] of entries) {
          const msg = readMessageFromSnapshot(id, data);
          if (msg) list.push(msg);
        }
      }
      const limited = list.length > MESSAGE_LIMIT ? list.slice(-MESSAGE_LIMIT) : list;
      onMessages(limited);
    },
    (err) => {
      console.error('Chat messages listener error:', err);
      const e = err instanceof Error ? err : new Error(String(err));
      onError?.(e);
      onMessages([]);
    }
  );
  return unsubscribe;
}

/** For customer app: listen when admin is typing. */
export function subscribeToAdminTyping(
  projectId: string,
  onAdminTyping: (typing: boolean) => void
): Unsubscribe {
  if (!realtimeDb) {
    onAdminTyping(false);
    return () => {};
  }
  const typingRef = ref(realtimeDb, typingPath(projectId));
  return onValue(typingRef, (snapshot) => {
    const val = snapshot.val();
    const admin = val && typeof val === 'object' && val.admin === true;
    onAdminTyping(!!admin);
  });
}

export function subscribeToLastSeen(
  projectId: string,
  onLastSeen: (admin: number | null, customer: number | null) => void
): Unsubscribe {
  if (!realtimeDb) {
    onLastSeen(null, null);
    return () => {};
  }
  const lastSeenRef = ref(realtimeDb, lastSeenPath(projectId));
  return onValue(lastSeenRef, (snapshot) => {
    const val = snapshot.val();
    const admin = val?.admin != null ? Number(val.admin) : null;
    const customer = val?.customer != null ? Number(val.customer) : null;
    onLastSeen(admin, customer);
  });
}

/** Send text or file message. One DB write. */
export async function sendMessage(
  projectId: string,
  senderId: string,
  senderType: SenderType,
  payload: {
    text?: string | null;
    fileUrl?: string | null;
    fileType?: string | null;
    replyTo?: ReplyRef | null;
  }
): Promise<string> {
  if (!realtimeDb) throw new Error('Realtime Database not configured');
  const messagesRef = ref(realtimeDb, messagesPath(projectId));
  const messageRef = push(messagesRef);
  const messageId = messageRef.key;
  if (!messageId) throw new Error('Failed to generate message id');

  const data: MessagePayload = {
    senderId,
    senderType,
    text: payload.text ?? null,
    fileUrl: payload.fileUrl ?? null,
    fileType: payload.fileType ?? null,
    createdAt: Date.now(),
    status: 'sent',
    replyTo: payload.replyTo ?? null,
  };
  await set(messageRef, data);
  return messageId;
}

/** Update customer lastSeen when chat panel opens. Call once when opening chat. */
export async function updateCustomerLastSeen(projectId: string): Promise<void> {
  if (!realtimeDb) return;
  const lastSeenRef = ref(realtimeDb, lastSeenPath(projectId));
  await update(lastSeenRef, { customer: Date.now() });
}

/** Mark messages as read (update status to 'read') for messages not yet read. */
export async function markMessagesAsRead(
  projectId: string,
  messageIds: string[]
): Promise<void> {
  if (!realtimeDb || messageIds.length === 0) return;
  const updates: Promise<void>[] = [];
  for (const messageId of messageIds) {
    const msgRef = ref(realtimeDb, messagePath(projectId, messageId));
    updates.push(
      get(msgRef).then((snapshot) => {
        const data = snapshot.val();
        if (data && data.status !== 'read') {
          return update(msgRef, { status: 'read' });
        }
      })
    );
  }
  await Promise.all(updates);
}

/** Set typing indicator (customer). Caller must throttle (e.g. max once per 2s). */
export async function setCustomerTyping(projectId: string, isTyping: boolean): Promise<void> {
  if (!realtimeDb) return;
  const typingRef = ref(realtimeDb, typingPath(projectId));
  await update(typingRef, { customer: isTyping ? true : null });
}

/** Upload chat attachment to VPS via same-origin API (public URL under /uploads/...). */
export async function uploadChatFile(
  projectId: string,
  file: File
): Promise<{ url: string; fileType: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isPdf = file.type === 'application/pdf' || ext === 'pdf';
  const fileType = isPdf ? 'pdf' : 'image';
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', `chat/${projectId}`);
  const res = await fetch('/api/storage/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Upload failed');
  }
  const data = (await res.json()) as { secure_url?: string };
  if (!data.secure_url) throw new Error('Upload failed');
  return { url: data.secure_url, fileType };
}
