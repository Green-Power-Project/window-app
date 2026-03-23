import type { ChatMessage } from '@/lib/chatRealtimeTypes';

/** Unread for customer = messages from admin still marked sent. */
export function countUnreadChatForCustomer(messages: ChatMessage[]): number {
  return messages.filter((m) => m.senderType === 'admin' && m.status === 'sent').length;
}

/** Unread for admin = messages from customer still marked sent. */
export function countUnreadChatForAdmin(messages: ChatMessage[]): number {
  return messages.filter((m) => m.senderType === 'customer' && m.status === 'sent').length;
}
