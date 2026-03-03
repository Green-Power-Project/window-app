/**
 * Customer messages (comments): general folder messages and file-specific comments.
 * Stored in customerMessages collection. Admin can mark read and resolve.
 */

export type CustomerMessageStatus = 'unread' | 'read' | 'resolved';
export type CustomerMessageType = 'general' | 'file_comment';

export interface CustomerMessage {
  id: string;
  projectId: string;
  folderPath: string;
  customerId: string;
  message: string;
  subject?: string;
  fileName?: string;
  filePath?: string;
  status: CustomerMessageStatus;
  messageType: CustomerMessageType;
  createdAt: Date | null;
}
