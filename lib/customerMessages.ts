/**
 * Customer messages (comments): general folder messages and file-specific comments.
 * Stored in customerMessages collection. Admin can mark read and resolve.
 * Replies use parentMessageId + threadRootId for two-way threads.
 */

export type CustomerMessageStatus = 'unread' | 'read' | 'resolved';
export type CustomerMessageAuthorType = 'customer' | 'admin';
export type CustomerMessageType = 'general' | 'file_comment' | 'admin_reply';

export interface CustomerMessage {
  id: string;
  projectId: string;
  folderPath: string;
  /** Thread owner (customer uid). Admin replies use the same field so the customer query returns the full thread. */
  customerId: string;
  message: string;
  subject?: string;
  fileName?: string;
  filePath?: string;
  status: CustomerMessageStatus;
  messageType: CustomerMessageType;
  createdAt: Date | null;
  authorType?: CustomerMessageAuthorType;
  /** Set for replies; root messages omit or null. */
  parentMessageId?: string | null;
  /** Root message id for this thread (equals root’s id). */
  threadRootId?: string | null;
}
