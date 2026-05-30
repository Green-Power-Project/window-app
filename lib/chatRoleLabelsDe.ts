import type { SenderType } from '@/lib/chatRealtimeTypes';

/**
 * Role labels shown on chat bubbles — always German.
 * Auftraggeber = portal/admin user; Auftragnehmer = customer (client).
 */
export function chatRoleLabelGerman(senderType: SenderType | string | undefined | null): string {
  return senderType === 'admin' ? 'Auftragnehmer' : 'Auftraggeber';
}

/** Shown when the portal user is typing (customer-facing chat). */
export const CHAT_TYPING_AUFTRAGGEBER = 'Auftraggeber schreibt …';
