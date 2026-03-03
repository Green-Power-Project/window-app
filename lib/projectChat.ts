/**
 * Per-project chat: one conversation per project.
 * Messages live in projectConversations/{projectId}/messages.
 * Customer: send only (text, photos, documents). Admin: full manage (send, edit, delete).
 */

export type ProjectChatAuthorType = 'customer' | 'admin';

/** Quoted/reply reference for a message */
export interface ProjectChatReplyTo {
  messageId: string;
  /** Preview text of the original message */
  text: string;
  authorType: ProjectChatAuthorType;
}

export interface ProjectChatMessage {
  id: string;
  authorType: ProjectChatAuthorType;
  authorId: string;
  text: string;
  createdAt: Date | null;
  attachmentUrls?: string[];
  attachmentNames?: string[];
  /** True while message is being sent (optimistic UI, WhatsApp-style). */
  pending?: boolean;
  /** When replying to another message */
  replyTo?: ProjectChatReplyTo;
  /** Set when message was edited (admin only) */
  editedAt?: Date | null;
}
