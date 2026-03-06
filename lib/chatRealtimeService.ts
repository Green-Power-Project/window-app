/**
 * Chat service: Firebase Realtime Database + Storage.
 * No Firestore. One write per message; read receipt only when chat opens; typing throttled by caller.
 */

import {
  ref,
  push,
  set,
  update,
  get,
  query,
  limitToLast,
  orderByKey,
  onValue,
  Unsubscribe,
} from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { realtimeDb, storage } from '@/lib/firebase';
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

function readMessageFromSnapshot(messageId: string, data: Record<string, unknown>): ChatMessage | null {
  if (!data || typeof data.createdAt !== 'number') return null;
  return {
    messageId,
    senderId: String(data.senderId ?? ''),
    senderType: (data.senderType === 'customer' ? 'customer' : 'admin') as SenderType,
    text: data.text != null ? String(data.text) : null,
    fileUrl: data.fileUrl != null ? String(data.fileUrl) : null,
    fileType: data.fileType != null ? String(data.fileType) : null,
    createdAt: data.createdAt as number,
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

export function subscribeToMessages(
  projectId: string,
  onMessages: (messages: ChatMessage[]) => void
): Unsubscribe {
  if (!realtimeDb) {
    onMessages([]);
    return () => {};
  }
  const messagesRef = ref(realtimeDb, messagesPath(projectId));
  const limited = query(
    messagesRef,
    orderByKey(),
    limitToLast(MESSAGE_LIMIT)
  );
  const unsubscribe = onValue(limited, (snapshot) => {
    const val = snapshot.val();
    const list: ChatMessage[] = [];
    if (val && typeof val === 'object') {
      const entries = Object.entries(val) as [string, Record<string, unknown>][];
      entries.sort((a, b) => (a[1].createdAt as number) - (b[1].createdAt as number));
      for (const [id, data] of entries) {
        const msg = readMessageFromSnapshot(id, data);
        if (msg) list.push(msg);
      }
    }
    onMessages(list);
  }, (err) => {
    console.error('Chat messages listener error:', err);
    onMessages([]);
  });
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

/** Upload file to Storage and return download URL. */
export async function uploadChatFile(
  projectId: string,
  file: File
): Promise<{ url: string; fileType: string }> {
  if (!storage) throw new Error('Firebase Storage not configured');
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isPdf = file.type === 'application/pdf' || ext === 'pdf';
  const fileType = isPdf ? 'pdf' : 'image';
  const name = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const path = `chat/${projectId}/${name}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { url, fileType };
}
