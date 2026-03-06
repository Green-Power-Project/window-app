/**
 * Chat over Firebase Realtime Database (no Firestore).
 * Types and path helpers only.
 */

export type SenderType = 'admin' | 'customer';

export type MessageStatus = 'sent' | 'read';

export interface ChatMessage {
  messageId: string;
  senderId: string;
  senderType: SenderType;
  text: string | null;
  fileUrl: string | null;
  fileType: string | null;
  createdAt: number;
  status: MessageStatus;
  replyTo: ReplyRef | null;
  editedAt?: number | null;
}

export interface ReplyRef {
  messageId: string;
  text: string | null;
  fileType: string | null;
}

/** Realtime DB payload for a new message (one write per message). */
export interface MessagePayload {
  senderId: string;
  senderType: SenderType;
  text: string | null;
  fileUrl: string | null;
  fileType: string | null;
  createdAt: number;
  status: MessageStatus;
  replyTo: ReplyRef | null;
  editedAt?: number | null;
}

const CHATS = 'chats';
const MESSAGES = 'messages';
const TYPING = 'typing';
const LAST_SEEN = 'lastSeen';

export function chatPath(projectId: string): string {
  return `${CHATS}/${projectId}`;
}

export function messagesPath(projectId: string): string {
  return `${chatPath(projectId)}/${MESSAGES}`;
}

export function messagePath(projectId: string, messageId: string): string {
  return `${messagesPath(projectId)}/${messageId}`;
}

export function typingPath(projectId: string): string {
  return `${chatPath(projectId)}/${TYPING}`;
}

export function lastSeenPath(projectId: string): string {
  return `${chatPath(projectId)}/${LAST_SEEN}`;
}

export const MESSAGE_LIMIT = 100;
