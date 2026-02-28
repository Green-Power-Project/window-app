/**
 * Per-folder chat: one conversation per (projectId, folderPath) with one subject.
 * Messages live in folderConversations/{conversationId}/messages.
 */

export function getFolderConversationId(projectId: string, folderPath: string): string {
  const safePath = folderPath.replace(/\//g, '_');
  return `${projectId}__${safePath}`;
}

export type FolderChatAuthorType = 'customer' | 'admin';

export interface FolderChatMessage {
  id: string;
  authorType: FolderChatAuthorType;
  authorId: string;
  text: string;
  createdAt: Date | null;
  fileName?: string;
  filePath?: string;
}
