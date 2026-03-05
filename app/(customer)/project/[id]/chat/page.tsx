'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useLayoutTitle } from '@/contexts/LayoutTitleContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
} from 'firebase/firestore';
import type { DocumentSnapshot } from 'firebase/firestore';
import { type ProjectChatMessage } from '@/lib/projectChat';
import { getAdminPanelBaseUrl } from '@/lib/adminPanelUrl';

const CLOUDINARY_ENDPOINT = '/api/cloudinary';
const MESSAGE_PAGE_SIZE = 50;

async function uploadToCloudinary(file: File, folderPath: string): Promise<{ secure_url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (preset) formData.append('upload_preset', preset);
  formData.append('folder', folderPath);

  const res = await fetch(`${CLOUDINARY_ENDPOINT}/upload`, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

function isImageFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.gif') || lower.endsWith('.webp');
}

function formatChatDate(d: Date | null): string {
  if (!d) return '';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString();
}

function getDateKey(d: Date | null): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateSeparatorLabel(d: Date | null, t: (key: string) => string): string {
  if (!d) return '';
  const today = new Date();
  const key = getDateKey(d);
  const todayKey = getDateKey(today);
  if (key === todayKey) return t('common.today');
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === getDateKey(yesterday)) return t('common.yesterday');
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function mapDocToMessage(d: { id: string; data: () => Record<string, unknown> }): ProjectChatMessage {
  const data = d.data();
  const replyToData = data.replyTo as { messageId: string; text: string; authorType: string } | undefined;
  return {
    id: d.id,
    authorType: (data.authorType as 'customer' | 'admin') || 'customer',
    authorId: (data.authorId as string) || '',
    text: (data.text as string) || '',
    createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() ?? null,
    attachmentUrls: (data.attachmentUrls as string[] | undefined) || [],
    attachmentNames: (data.attachmentNames as string[] | undefined) || [],
    replyTo: replyToData ? { messageId: replyToData.messageId, text: replyToData.text, authorType: replyToData.authorType as 'customer' | 'admin' } : undefined,
    editedAt: (data.editedAt as { toDate?: () => Date })?.toDate?.() ?? null,
  };
}

export default function ProjectChatPage() {
  const { t } = useLanguage();
  const params = useParams();
  const { currentUser } = useAuth();
  const { setTitle } = useLayoutTitle();
  const projectId = params.id as string;

  const [project, setProject] = useState<{ id: string; name: string; customerId: string } | null>(null);
  const [messages, setMessages] = useState<ProjectChatMessage[]>([]);
  const [olderMessages, setOlderMessages] = useState<ProjectChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ url: string; name: string; isImage: boolean } | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoadFailed, setPdfLoadFailed] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<ProjectChatMessage[]>([]);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ msg: ProjectChatMessage; x: number; y: number } | null>(null);
  const [replyingTo, setReplyingTo] = useState<ProjectChatMessage | null>(null);
  const pdfBlobUrlRef = useRef<string | null>(null);
  const prevMessageIdsRef = useRef<Set<string>>(new Set());
  const pendingMessagesRef = useRef<ProjectChatMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const oldestDocSnapshotRef = useRef<DocumentSnapshot | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pendingMessagesRef.current = pendingMessages;
  }, [pendingMessages]);

  useEffect(() => {
    if (!loading && project) inputRef.current?.focus();
  }, [loading, project]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  function handleCopyMessage(msg: ProjectChatMessage) {
    const text = msg.text || (msg.attachmentNames?.length ? msg.attachmentNames.join(', ') : '');
    if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
    setContextMenu(null);
  }

  function openContextMenu(msg: ProjectChatMessage, x: number, y: number) {
    setContextMenu({ msg, x, y });
  }

  function checkScrollPosition() {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowScrollToBottom(!nearBottom);
  }

  function scrollToBottom() {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      setShowScrollToBottom(false);
    }
    if (conversationRef) setDoc(conversationRef, { lastReadByCustomer: serverTimestamp() }, { merge: true }).catch(() => {});
  }

  function reportTyping() {
    if (!conversationRef) return;
    setDoc(conversationRef, { typingByCustomer: serverTimestamp() }, { merge: true }).catch(() => {});
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
      if (conversationRef) setDoc(conversationRef, { typingByCustomer: null }, { merge: true }).catch(() => {});
    }, 3000);
  }

  async function handleDownload(url: string, name: string) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }
  }

  useEffect(() => {
    if (loading) setTitle(t('common.loading'));
    else if (project) setTitle(`${project.name} – ${t('projects.projectChat')}`);
    return () => setTitle(null);
  }, [loading, project, t, setTitle]);

  useEffect(() => {
    if (!currentUser || !projectId || !db) return;

    const unsub = onSnapshot(doc(db, 'projects', projectId), (snap) => {
      if (!snap.exists()) {
        setError(t('messages.error.notFound'));
        setLoading(false);
        return;
      }
      const data = snap.data() as { customerId: string; name: string };
      if (data.customerId !== currentUser.uid) {
        setError(t('messages.error.permission'));
        setLoading(false);
        return;
      }
      setProject({ id: snap.id, name: data.name, customerId: data.customerId });
      setError('');
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser, projectId, t]);

  const conversationRef = db && projectId ? doc(db, 'projectConversations', projectId) : null;
  const messagesRef = conversationRef ? collection(conversationRef, 'messages') : null;
  const [lastReadByAdmin, setLastReadByAdmin] = useState<Date | null>(null);
  const [adminTypingAt, setAdminTypingAt] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!messagesRef || !currentUser) {
      setMessages([]);
      setOlderMessages([]);
      setHasMoreOlder(false);
      return;
    }
    setOlderMessages([]);
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(MESSAGE_PAGE_SIZE));
    const unsub = onSnapshot(q, (snap) => {
      const list: ProjectChatMessage[] = snap.docs.map((d) => mapDocToMessage(d)).reverse();
      oldestDocSnapshotRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      setHasMoreOlder(snap.docs.length === MESSAGE_PAGE_SIZE);
      const fromServer = !snap.metadata.fromCache;
      const prevIds = prevMessageIdsRef.current;
      const newIds = new Set(list.map((m) => m.id));
      const newlyAddedIds = new Set([...newIds].filter((id) => !prevIds.has(id)));
      prevMessageIdsRef.current = newIds;

      const prev = pendingMessagesRef.current;
      const usedRealIds = new Set<string>();
      const nextPending = prev.filter((p) => {
        const match = list.find(
          (m) =>
            newlyAddedIds.has(m.id) &&
            m.authorId === p.authorId &&
            m.text === p.text &&
            (m.attachmentNames?.length ?? 0) === (p.attachmentNames?.length ?? 0) &&
            !usedRealIds.has(m.id)
        );
        if (match) {
          usedRealIds.add(match.id);
          return false;
        }
        return true;
      });
      const hadPending = prev.length > 0;
      const hasMatch = nextPending.length < prev.length;
      const shouldUpdateMessages = fromServer || !hadPending || hasMatch;
      if (shouldUpdateMessages) {
        setMessages(list);
      }
      setPendingMessages(nextPending);
    }, (err) => {
      console.error('Project chat listener error:', err);
      setMessages([]);
      setHasMoreOlder(false);
    });
    return () => unsub();
  }, [projectId, currentUser]);

  useEffect(() => {
    if (!conversationRef) return;
    const unsub = onSnapshot(conversationRef, (snap) => {
      const data = snap.data();
      const readAt = data?.lastReadByAdmin?.toDate?.();
      setLastReadByAdmin(readAt ?? null);
      const typingAt = data?.typingByAdmin?.toDate?.();
      setAdminTypingAt(typingAt ?? null);
    });
    return () => unsub();
  }, [conversationRef]);

  useEffect(() => {
    if (!conversationRef) return;
    setDoc(conversationRef, { lastReadByCustomer: serverTimestamp() }, { merge: true }).catch(() => {});
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (conversationRef) setDoc(conversationRef, { typingByCustomer: null }, { merge: true }).catch(() => {});
    };
  }, [conversationRef, projectId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setShowScrollToBottom(false);
  }, [messages, pendingMessages]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  useEffect(() => {
    if (!preview || preview.isImage) {
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
      setPdfBlobUrl(null);
      setPdfLoadFailed(false);
      return;
    }
    setPdfLoadFailed(false);
    fetch(preview.url, { mode: 'cors' })
      .then((r) => r.blob())
      .then((blob) => {
        if (pdfBlobUrlRef.current) URL.revokeObjectURL(pdfBlobUrlRef.current);
        const url = URL.createObjectURL(blob);
        pdfBlobUrlRef.current = url;
        setPdfBlobUrl(url);
      })
      .catch(() => {
        setPdfBlobUrl(null);
        setPdfLoadFailed(true);
      });
    return () => {
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
      setPdfBlobUrl(null);
    };
  }, [preview]);

  async function ensureConversationDoc() {
    if (!db || !conversationRef || !projectId) return;
    const snap = await getDoc(conversationRef);
    if (!snap.exists()) {
      await setDoc(conversationRef, {
        projectId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  }

  async function loadOlderMessages() {
    if (!messagesRef || loadingOlder || !hasMoreOlder || !oldestDocSnapshotRef.current) return;
    setLoadingOlder(true);
    try {
      const q = query(
        messagesRef,
        orderBy('createdAt', 'desc'),
        startAfter(oldestDocSnapshotRef.current),
        limit(MESSAGE_PAGE_SIZE)
      );
      const result = await getDocs(q);
      const list = result.docs.map((d) => mapDocToMessage(d)).reverse();
      if (list.length > 0) {
        setOlderMessages((prev) => [...list, ...prev]);
        oldestDocSnapshotRef.current = result.docs[result.docs.length - 1];
      }
      setHasMoreOlder(result.docs.length === MESSAGE_PAGE_SIZE);
    } catch (err) {
      console.error('Error loading older messages:', err);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text && !uploading) return;
    if (!project || !currentUser || !messagesRef) return;

    const replyToPayload = replyingTo ? { messageId: replyingTo.id, text: (replyingTo.text || replyingTo.attachmentNames?.[0] || '').slice(0, 100), authorType: replyingTo.authorType } : null;
    const optimistic: ProjectChatMessage = {
      id: `pending-${Date.now()}`,
      authorType: 'customer',
      authorId: currentUser.uid,
      text,
      createdAt: new Date(),
      attachmentUrls: [],
      attachmentNames: [],
      pending: true,
      replyTo: replyToPayload ? { messageId: replyToPayload.messageId, text: replyToPayload.text, authorType: replyToPayload.authorType } : undefined,
    };
    setPendingMessages((prev) => [...prev, optimistic]);
    setSending(true);
    setError('');
    setReplyingTo(null);
    try {
      await ensureConversationDoc();
      if (conversationRef) setDoc(conversationRef, { typingByCustomer: null }, { merge: true }).catch(() => {});
      const docData: Record<string, unknown> = {
        authorType: 'customer',
        authorId: currentUser.uid,
        text: text || '',
        createdAt: serverTimestamp(),
        attachmentUrls: [],
        attachmentNames: [],
      };
      if (replyToPayload) docData.replyTo = replyToPayload;
      await addDoc(messagesRef, docData);
      setInput('');
      inputRef.current?.focus();
      await updateDoc(conversationRef!, {
        updatedAt: serverTimestamp(),
        lastMessage: text.slice(0, 100),
        lastMessageAt: serverTimestamp(),
      });

      const adminPanelBaseUrl = getAdminPanelBaseUrl();
      if (adminPanelBaseUrl && text) {
        fetch(`${adminPanelBaseUrl}/api/notifications/customer-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            projectName: project.name,
            customerId: currentUser.uid,
            message: text,
          }),
        }).catch(() => {});
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('projects.messageSendFailed'));
      setPendingMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (!project || !currentUser || !messagesRef) return;

    const filePreviewText = files.length === 1 ? files[0].name : `${files.length} files`;
    const optimistic: ProjectChatMessage = {
      id: `pending-${Date.now()}`,
      authorType: 'customer',
      authorId: currentUser.uid,
      text: filePreviewText,
      createdAt: new Date(),
      attachmentUrls: [],
      attachmentNames: files.map((f) => f.name),
      pending: true,
    };
    setPendingMessages((prev) => [...prev, optimistic]);
    setUploading(true);
    setError('');
    try {
      await ensureConversationDoc();
      const folderPath = `projects/${projectId}/chat`;
      const urls: string[] = [];
      const names: string[] = [];

      for (const file of files) {
        const { secure_url } = await uploadToCloudinary(file, folderPath);
        urls.push(secure_url);
        names.push(file.name);
      }

      await addDoc(messagesRef, {
        authorType: 'customer',
        authorId: currentUser.uid,
        text: names.length === 1 ? names[0] : `${names.length} files`,
        createdAt: serverTimestamp(),
        attachmentUrls: urls,
        attachmentNames: names,
      });
      const preview = names.length === 1 ? names[0] : `${names.length} files`;
      await updateDoc(conversationRef!, {
        updatedAt: serverTimestamp(),
        lastMessage: preview,
        lastMessageAt: serverTimestamp(),
      });

      const adminPanelBaseUrl = getAdminPanelBaseUrl();
      if (adminPanelBaseUrl) {
        fetch(`${adminPanelBaseUrl}/api/notifications/customer-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            projectName: project.name,
            customerId: currentUser.uid,
            message: names.join(', '),
          }),
        }).catch(() => {});
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('projects.messageSendFailed'));
      setPendingMessages((prev) => prev.slice(0, -1));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      inputRef.current?.focus();
    }
  }

  const sortedMessages = [...olderMessages, ...messages, ...pendingMessages].sort(
    (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
  );
  const searchLower = searchQuery.trim().toLowerCase();
  const displayMessages = searchLower
    ? sortedMessages.filter((m) => {
        if ((m.text || '').toLowerCase().includes(searchLower)) return true;
        return (m.attachmentNames || []).some((n) => n.toLowerCase().includes(searchLower));
      })
    : sortedMessages;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-green-power-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="px-4 py-6">
        <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded">
          {error || t('messages.error.notFound')}
        </div>
        <Link href={`/project/${projectId}`} className="inline-block mt-4 text-sm text-green-power-600 hover:underline">
          ← {t('common.back')} {t('projects.title')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-120px)] px-3 sm:px-6 py-4">
      <div className="mb-4">
        <Link href={`/project/${projectId}`} className="text-sm text-green-power-600 hover:underline flex items-center gap-1">
          ← {t('common.back')} {project.name}
        </Link>
      </div>

      <div className="flex flex-col bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100/80">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{t('projects.projectChat')}</h2>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('common.search')}
              className="flex-1 max-w-[180px] px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-power-500"
            />
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            {adminTypingAt && (Date.now() - adminTypingAt.getTime() < 5000)
              ? t('projects.typing')
              : lastReadByAdmin
                ? (Date.now() - lastReadByAdmin.getTime() < 60000 ? t('projects.online') : t('projects.lastSeen', { time: lastReadByAdmin.toLocaleString() }))
                : t('projects.projectChatDescription')}
          </p>
        </div>

        {error && (
          <div className="mx-4 mt-2 p-2 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        <div className="relative h-[400px] flex-shrink-0">
          <div
            ref={listRef}
            className="absolute inset-0 overflow-y-auto scrollbar-hide p-4 space-y-3"
            onScroll={checkScrollPosition}
          >
          {hasMoreOlder && (
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={loadOlderMessages}
                disabled={loadingOlder}
                className="text-sm text-green-power-600 hover:underline disabled:opacity-50"
              >
                {loadingOlder ? t('common.loading') : t('projects.chatLoadOlder')}
              </button>
            </div>
          )}
          {displayMessages.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              {searchLower ? t('common.noResults') : t('projects.noChatMessagesYet')}
            </p>
          ) : (
            displayMessages.map((msg, idx) => {
              const isMe = msg.authorType === 'customer';
              const isPending = msg.pending === true;
              const msgDate = msg.createdAt;
              const prevDate = idx > 0 ? displayMessages[idx - 1].createdAt : null;
              const showDateSeparator = !msgDate ? false : getDateKey(msgDate) !== getDateKey(prevDate);
              return (
                <div key={msg.id} className="w-full flex flex-col items-center">
                  {showDateSeparator && (
                    <div className="flex justify-center w-full py-2">
                      <span className="text-xs text-gray-500 bg-white/90 dark:bg-gray-800/90 px-3 py-1 rounded-full shadow-sm">
                        {getDateSeparatorLabel(msgDate, t)}
                      </span>
                    </div>
                  )}
                <div
                  className={`flex flex-row gap-2 max-w-[85%] w-fit ${isMe ? 'self-end ml-auto flex-row-reverse items-end' : 'self-start items-start'}`}
                  onContextMenu={(e) => {
                    if (isPending) return;
                    e.preventDefault();
                    openContextMenu(msg, e.clientX, e.clientY);
                  }}
                  onTouchStart={(e) => {
                    if (isPending) return;
                    const touch = e.touches[0];
                    const x = touch?.clientX ?? 0;
                    const y = touch?.clientY ?? 0;
                    longPressTimerRef.current = setTimeout(() => openContextMenu(msg, x, y), 500);
                  }}
                  onTouchEnd={() => {
                    if (longPressTimerRef.current) {
                      clearTimeout(longPressTimerRef.current);
                      longPressTimerRef.current = null;
                    }
                  }}
                  onTouchCancel={() => {
                    if (longPressTimerRef.current) {
                      clearTimeout(longPressTimerRef.current);
                      longPressTimerRef.current = null;
                    }
                  }}
                >
                  {!isMe && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-medium" aria-hidden>
                      {t('projects.chatLabelAdmin').charAt(0)}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                  <span className={`text-xs font-medium mb-1 ${isMe ? 'text-green-power-700' : 'text-slate-600'}`}>
                    {isMe ? t('projects.chatLabelClient') : t('projects.chatLabelAdmin')}
                  </span>
                  <div className={`rounded-2xl px-3 py-2 w-fit max-w-full ${isMe ? 'bg-green-power-500 text-white' : 'bg-slate-100 text-gray-900'}`}>
                    {msg.replyTo && (
                        <div className={`border-l-2 pl-2 mb-1.5 ${isMe ? 'border-white/70' : 'border-green-power-500/50'}`}>
                          <p className="text-xs font-medium opacity-90">{msg.replyTo.authorType === 'customer' ? t('projects.chatLabelClient') : t('projects.chatLabelAdmin')}</p>
                          <p className="text-xs opacity-80 truncate max-w-[200px]">{msg.replyTo.text || ''}</p>
                        </div>
                      )}
                      {msg.text ? (
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {searchLower && msg.text.toLowerCase().includes(searchLower)
                            ? msg.text.split(new RegExp(`(${searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                                part.toLowerCase() === searchLower ? <mark key={i} className="bg-amber-200 rounded px-0.5">{part}</mark> : part
                              )
                            : msg.text}
                        </p>
                      ) : null}
                    {isPending && msg.attachmentNames && msg.attachmentNames.length > 0 && (
                      <div className="mt-2 flex items-center gap-2 text-sm opacity-90">
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden>
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          {t('common.sending')}
                        </span>
                      </div>
                    )}
                    {!isPending && msg.attachmentUrls && msg.attachmentUrls.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {msg.attachmentUrls.map((url, i) => {
                          const name = msg.attachmentNames?.[i] || `Attachment ${i + 1}`;
                          const isImage = isImageFile(name);
                          if (isImage) {
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setPreview({ url, name, isImage: true })}
                                className="block rounded-lg overflow-hidden max-w-[240px] max-h-[200px] text-left cursor-pointer"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt={name} className="w-full h-auto object-cover rounded-lg" />
                              </button>
                            );
                          }
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setPreview({ url, name, isImage: false })}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border w-full text-left ${isMe ? 'border-white/50 bg-white/10' : 'border-gray-300 bg-white/50'} hover:opacity-90 transition-opacity cursor-pointer`}
                            >
                              <span className="text-lg">📄</span>
                              <span className="text-xs truncate max-w-[140px]">{name}</span>
                              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    {isPending ? (
                      <>
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                        {t('common.sending')}
                      </>
                    ) : (
                      <>
                        {formatChatDate(msg.createdAt)}
                        {msg.editedAt && <span className="italic"> • {t('projects.chatEdited')}</span>}
                        {isMe && msg.createdAt && (
                          <span className="ml-0.5 flex items-center" title={lastReadByAdmin && lastReadByAdmin.getTime() >= msg.createdAt.getTime() ? t('projects.chatRead') : t('projects.chatSent')}>
                            {lastReadByAdmin && lastReadByAdmin.getTime() >= msg.createdAt.getTime() ? (
                              <svg className="w-4 h-4 text-green-power-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm-4.24-2.83L7.41 8.76 6 7.34 4.93 8.41l1.41 1.41 2.83-2.83-.01-.01zM2.41 13.41L6 9.83 4.59 8.41 2 11l.01.01 1.42 1.41 2.82-2.82zm10.18 2.83l5.66-5.66-1.41-1.41-4.24 4.24-1.42-1.41 1.41-1.41 1.42 1.41z" /></svg>
                            ) : (
                              <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm-4.24-2.83L7.41 8.76 6 7.34 4.93 8.41l1.41 1.41 2.83-2.83-.01-.01z" /></svg>
                            )}
                          </span>
                        )}
                      </>
                      )}
                  </p>
                  </div>
                </div>
                </div>
              );
            })
          )}
          </div>
          {showScrollToBottom && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-green-power-500 text-white shadow-lg hover:bg-green-power-600 flex items-center justify-center transition-colors z-10"
              aria-label={t('projects.scrollToLatest')}
              title={t('projects.scrollToLatest')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          )}
        </div>

        {replyingTo && (
          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs text-green-power-600 font-medium">{t('projects.chatReply')} • {replyingTo.authorType === 'customer' ? t('projects.chatLabelClient') : t('projects.chatLabelAdmin')}</p>
              <p className="text-xs text-gray-600 truncate">{replyingTo.text || (replyingTo.attachmentNames?.[0] ?? '')}</p>
            </div>
            <button type="button" onClick={() => setReplyingTo(null)} className="p-1.5 text-gray-500 hover:bg-gray-200 rounded-full" aria-label="Cancel reply">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        <div className="p-3 border-t border-gray-100 flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
            className="p-2 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            aria-label={t('common.upload')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); reportTyping(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={t('projects.messagePlaceholder')}
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500"
            maxLength={500}
            disabled={sending}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={(!input.trim() && !uploading) || sending}
            className="px-4 py-2.5 bg-green-power-600 text-white text-sm font-semibold rounded-xl hover:bg-green-power-700 disabled:opacity-50"
          >
            {sending ? t('common.sending') : t('common.sendMessage')}
          </button>
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-[100] min-w-[160px] py-1 bg-white rounded-lg shadow-xl border border-gray-200"
          style={{ left: Math.min(contextMenu.x, typeof window !== 'undefined' ? window.innerWidth - 180 : contextMenu.x), top: Math.max(8, contextMenu.y - 120) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-100"
            onClick={() => { setReplyingTo(contextMenu.msg); setContextMenu(null); inputRef.current?.focus(); }}
          >
            <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            {t('projects.chatReply')}
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-100"
            onClick={() => handleCopyMessage(contextMenu.msg)}
          >
            <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            {t('projects.chatCopy')}
          </button>
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Preview attachment"
        >
          <div
            className="bg-white rounded-xl max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
              <span className="text-sm font-medium text-gray-900 truncate max-w-[60%]">{preview.name}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(preview.url, preview.name)}
                  className="px-3 py-1.5 text-sm font-medium text-green-power-600 hover:bg-green-power-50 rounded-lg"
                >
                  {t('common.download')}
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="p-1.5 text-gray-500 hover:bg-gray-200 rounded-lg"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 min-h-0">
              {preview.isImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={preview.url} alt={preview.name} className="max-w-full max-h-[70vh] object-contain mx-auto" />
              ) : pdfBlobUrl ? (
                <iframe src={pdfBlobUrl} title={preview.name} className="w-full min-h-[70vh] border-0 rounded" />
              ) : pdfLoadFailed ? (
                <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 text-gray-600">
                  <p className="text-sm">{t('common.pdfPreviewUnavailable')}</p>
                  <button
                    type="button"
                    onClick={() => handleDownload(preview.url, preview.name)}
                    className="px-4 py-2 text-sm font-medium text-green-power-600 hover:bg-green-power-50 rounded-lg"
                  >
                    {t('common.download')}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 text-gray-600">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-power-500 border-t-transparent" />
                  <p className="text-sm">{t('common.loading')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
