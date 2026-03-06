'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useProjectChat } from '@/hooks/useProjectChat';
import { realtimeDb } from '@/lib/firebase';
import type { ChatMessage, ReplyRef } from '@/lib/chatRealtimeTypes';

interface ProjectChatPanelProps {
  projectId: string;
  projectName?: string;
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
}

export default function ProjectChatPanel({
  projectId,
  projectName,
  isOpen,
  onClose,
  currentUserId,
}: ProjectChatPanelProps) {
  const { t } = useLanguage();
  const {
    messages,
    adminTyping,
    sendMessage,
    uploadFile,
    setTypingThrottled,
    sendError,
    sending,
    uploading,
  } = useProjectChat(projectId, isOpen);

  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewerFile, setViewerFile] = useState<{ url: string; type: 'image' | 'pdf' } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to latest message when messages change (e.g. new message arrives).
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // When chat opens, scroll to latest message after panel is laid out.
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setReplyTo(null);
      setViewerFile(null);
    }
  }, [isOpen]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text && !replyTo) return;
    if (sending) return;
    await sendMessage(currentUserId, text || null, null, null, replyTo);
    setInputText('');
    setReplyTo(null);
    setTypingThrottled(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');
    if (!isImage && !isPdf) return;
    const result = await uploadFile(file);
    if (result) {
      await sendMessage(currentUserId, null, result.url, result.fileType, replyTo);
      setReplyTo(null);
    }
    e.target.value = '';
  };

  const handleCopy = async (msg: ChatMessage) => {
    const text = msg.text || (msg.fileUrl ? msg.fileUrl : '');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(msg.messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (_) {}
    setOpenMenuId(null);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  if (!realtimeDb) {
    return (
      <div className="fixed inset-0 z-40 flex">
        <div className="fixed inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
        <div className="relative flex flex-col w-full max-w-lg bg-white shadow-xl ml-auto h-full">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="text-lg font-semibold">{t('projects.projectChat')}</h2>
            <button type="button" onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:bg-gray-200">{t('common.close')}</button>
          </div>
          <div className="p-6 text-center text-gray-600 text-sm space-y-2">
            <p>{t('projects.chatNotReady')}</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Add <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_FIREBASE_DATABASE_URL</code> to this app&apos;s <code className="bg-gray-100 px-1 rounded">.env.local</code> (same URL as admin), then restart the dev server.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 flex">
        <div className="fixed inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
        <div className="relative flex flex-col w-full max-w-lg bg-white shadow-xl ml-auto h-full max-h-[100dvh]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 min-h-[56px] shrink-0">
            <div className="min-w-0 flex-1 pr-2">
              <h2 className="text-lg font-semibold text-gray-900 truncate">{t('projects.projectChat')}</h2>
              {projectName && <p className="text-xs text-gray-500 truncate">{projectName}</p>}
            </div>
            <button type="button" onClick={onClose} className="p-3 -m-2 rounded-xl text-gray-500 hover:bg-gray-200 active:bg-gray-300 min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0" aria-label={t('common.close')}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3 min-h-0">
            {messages.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">{t('projects.noChatMessagesYet')}</p>
            )}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.messageId}
                msg={msg}
                isOwn={msg.senderType === 'customer'}
                formatTime={formatTime}
                onReply={() => { setReplyTo({ messageId: msg.messageId, text: msg.text, fileType: msg.fileType }); setOpenMenuId(null); }}
                onCopy={() => handleCopy(msg)}
                onOpenFile={(url, type) => setViewerFile({ url, type })}
                copied={copiedId === msg.messageId}
                t={t}
                openMenuId={openMenuId}
                onMenuToggle={(id) => setOpenMenuId((prev) => (prev === id ? null : id))}
              />
            ))}
            {adminTyping && (
              <div className="flex justify-start">
                <span className="text-xs text-gray-500 italic px-3 py-1">{t('projects.typing')}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {replyTo && (
            <div className="px-4 py-2 bg-gray-100 border-t border-gray-200 flex items-center justify-between">
              <span className="text-sm text-gray-600 truncate flex-1">Reply: {replyTo.text || (replyTo.fileType === 'pdf' ? 'PDF' : 'Image')}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-gray-500 hover:text-gray-700 p-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          {sendError && (
            <div className="px-4 py-2 bg-red-50 text-red-700 text-sm">{sendError}</div>
          )}

          <div className="p-4 border-t border-gray-200 bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0">
            <div className="flex gap-2 items-center">
              <input type="file" ref={fileInputRef} accept="image/*,.pdf,application/pdf" className="hidden" onChange={handleFileSelect} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 flex items-center justify-center"
                title={t('projects.attachImageOrPdf')}
              >
                {uploading ? <span className="text-xs">...</span> : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                )}
              </button>
              <input
                type="text"
                value={inputText}
                onChange={(e) => { setInputText(e.target.value); setTypingThrottled(true); }}
                onBlur={() => setTypingThrottled(false)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={t('projects.typeMessage')}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                disabled={sending}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || (!inputText.trim() && !replyTo)}
                title={t('common.submit')}
                className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {sending ? (
                  <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewerFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setViewerFile(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] w-full overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <span className="text-sm font-medium text-gray-700">{viewerFile.type === 'pdf' ? 'PDF' : 'Image'}</span>
              <div className="flex gap-2">
                <a href={viewerFile.url} download target="_blank" rel="noopener noreferrer" className="text-sm text-green-600 hover:underline">
                  {t('projects.chatDownload')}
                </a>
                <button type="button" onClick={() => setViewerFile(null)} className="text-gray-500 hover:text-gray-700">{t('common.close')}</button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-4">
              {viewerFile.type === 'pdf' ? (
                <iframe src={viewerFile.url} className="w-full h-[70vh] border-0 rounded" title="PDF viewer" />
              ) : (
                <img src={viewerFile.url} alt="" className="max-w-full max-h-[70vh] object-contain mx-auto" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({
  msg,
  isOwn,
  formatTime,
  onReply,
  onCopy,
  onOpenFile,
  copied,
  t,
  openMenuId,
  onMenuToggle,
}: {
  msg: ChatMessage;
  isOwn: boolean;
  formatTime: (ts: number) => string;
  onReply: () => void;
  onCopy: () => void;
  onOpenFile: (url: string, type: 'image' | 'pdf') => void;
  copied: boolean;
  t: (key: string) => string;
  openMenuId?: string | null;
  onMenuToggle?: (id: string) => void;
}) {
  const isFile = !!msg.fileUrl;
  const isPdf = msg.fileType === 'pdf';
  const senderTitle = msg.senderType === 'admin' ? t('projects.chatAdmin') : t('projects.chatClient');
  const senderLabel = msg.senderType === 'admin' ? t('projects.chatLabelAdmin') : t('projects.chatLabelClient');
  const menuOpen = openMenuId === msg.messageId;
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onMenuToggle?.(msg.messageId);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen, msg.messageId, onMenuToggle]);

  return (
    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} w-max max-w-[85%] ${isOwn ? 'ml-auto' : ''}`}>
      <div className={`flex items-center justify-between gap-2 w-full mb-1 px-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-xs font-semibold ${isOwn ? 'text-green-700' : 'text-sky-700'}`}>{senderTitle}</span>
          <span className={`text-xs ${isOwn ? 'text-green-600' : 'text-sky-600'}`}>{senderLabel}</span>
        </div>
        <div className={`flex items-center gap-1 text-xs ${isOwn ? 'text-green-600' : 'text-slate-500'}`}>
          <span>{formatTime(msg.createdAt)}</span>
          {isOwn && (
            <span
              className={`text-sm ${msg.status === 'read' ? 'text-blue-600' : 'text-gray-500'}`}
              title={msg.status === 'read' ? t('projects.chatRead') : t('projects.chatSent')}
            >
              {msg.status === 'read' ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
      <div className={`flex items-end gap-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
        <div
          className={`relative rounded-2xl px-4 py-2.5 min-w-[4rem] max-w-[22rem] w-fit border ${
            isOwn ? 'bg-green-50 border-green-200 text-green-900' : 'bg-sky-50 border-sky-200 text-slate-800'
          }`}
        >
          {msg.replyTo && (
            <div className={`text-xs border-l-2 pl-2 mb-1 ${isOwn ? 'border-green-400 text-green-800' : 'border-sky-400 text-slate-700'} opacity-90`}>
              {msg.replyTo.text || (msg.replyTo.fileType === 'pdf' ? 'PDF' : 'Image')}
            </div>
          )}
          {msg.text && (
            <p className="text-sm whitespace-pre-wrap break-words">
              {msg.text}
              {msg.editedAt != null && <span className="ml-1 text-xs opacity-75">({t('projects.chatEdited')})</span>}
            </p>
          )}
          {isFile && (
            <div className="mt-2 space-y-1">
              {isPdf ? (
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => onOpenFile(msg.fileUrl!, 'pdf')} className={`text-left text-sm underline font-medium ${isOwn ? 'text-green-700 hover:text-green-800' : 'text-sky-700 hover:text-sky-800'}`}>
                    {t('projects.chatOpen')} PDF
                  </button>
                  <a href={msg.fileUrl!} download target="_blank" rel="noopener noreferrer" className={`text-sm underline ${isOwn ? 'text-green-700 hover:text-green-800' : 'text-sky-700 hover:text-sky-800'}`}>
                    {t('projects.chatDownload')}
                  </a>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => onOpenFile(msg.fileUrl!, 'image')} className="block">
                    <img src={msg.fileUrl!} alt="" className="max-w-full max-h-48 rounded object-cover" />
                  </button>
                  <a href={msg.fileUrl!} download target="_blank" rel="noopener noreferrer" className={`text-sm underline ${isOwn ? 'text-green-700 hover:text-green-800' : 'text-sky-700 hover:text-sky-800'}`}>
                    {t('projects.chatDownload')}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMenuToggle?.(msg.messageId); }}
            className="p-1.5 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
            aria-label="Message actions"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18" r="1.5" /></svg>
          </button>
          {menuOpen && (
            <div className="absolute top-full right-0 mt-1 min-w-[140px] py-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
              <button type="button" onClick={onReply} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                {t('projects.chatReply')}
              </button>
              <button type="button" onClick={onCopy} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                {copied ? t('projects.chatCopied') : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>{t('projects.chatCopy')}</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
