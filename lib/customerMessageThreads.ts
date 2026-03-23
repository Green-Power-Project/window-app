/**
 * Group flat customerMessages docs into conversation threads (by root message id).
 */

export type ThreadableMessage = {
  id: string;
  parentMessageId?: string | null;
  createdAt?: Date | null;
};

export function groupMessagesByThread<T extends ThreadableMessage>(messages: T[]): T[][] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const findRoot = (m: T): string => {
    if (!m.parentMessageId) return m.id;
    const p = byId.get(m.parentMessageId);
    return p ? findRoot(p as T) : m.id;
  };
  const threads = new Map<string, T[]>();
  for (const m of messages) {
    const r = findRoot(m);
    if (!threads.has(r)) threads.set(r, []);
    threads.get(r)!.push(m);
  }
  for (const arr of threads.values()) {
    arr.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  }
  return [...threads.values()];
}

/** Newest activity first (by latest message in each thread). */
export function sortThreadsNewestFirst<T extends ThreadableMessage>(threads: T[][]): T[][] {
  return [...threads].sort((a, b) => {
    const ta = Math.max(...a.map((m) => m.createdAt?.getTime() ?? 0));
    const tb = Math.max(...b.map((m) => m.createdAt?.getTime() ?? 0));
    return tb - ta;
  });
}

export type FileCommentTarget = {
  cloudinaryPublicId: string;
  fileName: string;
};

/** Match file comments / admin replies to a file (by public id, or legacy by file name). */
export function messageBelongsToFileComment<
  T extends { filePath?: string; fileName?: string; messageType?: string },
>(m: T, file: FileCommentTarget): boolean {
  const fp = (m.filePath || '').trim();
  const pub = (file.cloudinaryPublicId || '').trim();
  if (fp && pub && fp === pub) return true;
  const mt = m.messageType || '';
  if (mt === 'general') return false;
  if (m.fileName && file.fileName && m.fileName.trim() === file.fileName.trim()) return true;
  return false;
}

/**
 * All messages in any thread that includes at least one message for this file
 * (so replies stay visible even if filePath was duplicated inconsistently).
 */
export function expandThreadsForFile<
  T extends ThreadableMessage & { filePath?: string; fileName?: string; messageType?: string },
>(messages: T[], file: FileCommentTarget): T[] {
  const threads = groupMessagesByThread(messages);
  const out: T[] = [];
  for (const thread of threads) {
    if (thread.some((m) => messageBelongsToFileComment(m, file))) {
      out.push(...thread);
    }
  }
  return out.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
}
