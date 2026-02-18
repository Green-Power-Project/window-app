'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCatalogFolders, getCatalogEntries, type CatalogFolder, type CatalogEntry } from '@/lib/catalogClient';
import PdfThumbnail from '@/components/PdfThumbnail';

export default function CataloguePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [folders, setFolders] = useState<CatalogFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);

  const rootFolders = folders.filter((f) => !f.parentId);
  const getChildren = (parentId: string) => folders.filter((f) => f.parentId === parentId);

  /** When clicking a folder: if it has subfolders, select the first subfolder; otherwise select the folder itself. */
  const getEffectiveFolderId = useCallback(
    (folder: CatalogFolder) => {
      const children = folders.filter((f) => f.parentId === folder.id);
      if (children.length > 0) return children[0]!.id;
      return folder.id;
    },
    [folders]
  );

  const loadFolders = useCallback(async () => {
    setFoldersLoading(true);
    try {
      const list = await getCatalogFolders();
      setFolders(list);
      setSelectedFolderId((prev) => {
        if (prev !== null) return prev;
        const roots = list.filter((f) => !f.parentId);
        if (roots.length === 0) return null;
        const firstRoot = roots[0]!;
        const children = list.filter((f) => f.parentId === firstRoot.id);
        if (children.length > 0) return children[0]!.id;
        return firstRoot.id;
      });
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const loadEntries = useCallback(async (folderId: string) => {
    setEntriesLoading(true);
    try {
      const list = await getCatalogEntries(folderId);
      setEntries(list);
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedFolderId) {
      loadEntries(selectedFolderId);
    } else {
      setEntries([]);
    }
  }, [selectedFolderId, loadEntries]);

  const handleFolderClick = useCallback(
    (folder: CatalogFolder) => {
      const effectiveId = getEffectiveFolderId(folder);
      setSelectedFolderId(effectiveId);
    },
    [getEffectiveFolderId]
  );

  const openPdfInNewScreen = useCallback((entry: CatalogEntry) => {
    router.push(`/catalogue/view?folderId=${encodeURIComponent(entry.folderId)}&entryId=${encodeURIComponent(entry.id)}`);
  }, [router]);

  return (
    <div className="relative z-10 flex flex-1 flex-col w-full min-h-screen min-h-[100dvh] overflow-x-hidden">
      {/* Header – mobile-optimised: touch targets 44px+, safe padding */}
      <header className="flex-shrink-0 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2 sm:gap-3 px-4 py-3 bg-transparent min-h-[52px]">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-gray-900 hover:text-green-power-700 active:opacity-80 transition-opacity px-3 py-3 min-h-[44px] rounded-xl bg-white/90 sm:bg-gray-100 w-fit touch-manipulation"
          aria-label={t('offer.backToGallery')}
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>{t('offer.backToGallery')}</span>
        </Link>
        <h1 className="text-lg sm:text-2xl font-bold text-gray-900 tracking-tight text-center sm:text-left order-first sm:order-none w-full sm:w-auto flex-1 sm:flex-initial min-h-[32px] flex items-center justify-center sm:justify-start">
          {t('catalogue.title')}
        </h1>
        <Link
          href="/offer"
          className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl font-semibold text-white shadow-md active:scale-[0.98] transition-transform touch-manipulation flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
            boxShadow: '0 2px 8px rgba(93, 138, 106, 0.4)',
          }}
        >
          <span className="text-sm sm:text-base">{t('offer.requestQuote')}</span>
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </Link>
      </header>

      {/* Full-height content: folder tree + entries – white background */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row w-full bg-white">
        {/* Folder tree – left sidebar, mobile: compact strip; desktop: sidebar */}
        <aside className="flex-shrink-0 w-full md:w-56 lg:w-64 border-b md:border-b-0 md:border-r border-gray-200 bg-white px-4 py-3 sm:p-3 overflow-y-auto overflow-x-hidden">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 sm:mb-2.5">
                {t('catalog.foldersTitle')}
              </p>
              {foldersLoading ? (
                <div className="space-y-1 animate-pulse" aria-busy="true" aria-label={t('common.loading')}>
                  <div className="h-10 bg-gray-200 rounded-md w-full" />
                  <div className="h-10 bg-gray-100 rounded-md w-full ml-2" />
                  <div className="h-10 bg-gray-200 rounded-md w-full" />
                </div>
              ) : folders.length === 0 ? (
                <p className="text-xs text-gray-500 py-3">{t('catalog.noFolders')}</p>
              ) : (
                <div className="space-y-0.5 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/50">
                  {rootFolders.map((folder) => {
                    const children = getChildren(folder.id);
                    const hasChildSelected = children.some((c) => c.id === selectedFolderId);
                    const isSelected = selectedFolderId === folder.id || hasChildSelected;
                    return (
                      <div key={folder.id} className="border-b border-gray-100 last:border-b-0">
                        <button
                          type="button"
                          onClick={() => handleFolderClick(folder)}
                          className={`w-full text-left px-3 py-3 min-h-[44px] text-sm font-medium rounded-lg transition-colors truncate flex items-center gap-2 touch-manipulation active:opacity-90 ${
                            isSelected ? 'bg-green-power-100 text-green-power-800' : 'text-gray-800 hover:bg-gray-100'
                          }`}
                        >
                          <span className="shrink-0 text-base opacity-80" aria-hidden>📁</span>
                          <span className="truncate">{folder.name || t('catalog.untitledFolder')}</span>
                        </button>
                        {children.length > 0 && isSelected && (
                          <div className="ml-6 pl-4 py-1.5 border-l-2 border-green-power-200 space-y-0.5 bg-gray-50">
                            {children.map((cf) => {
                              const isChildSelected = selectedFolderId === cf.id;
                              return (
                                <button
                                  key={cf.id}
                                  type="button"
                                  onClick={() => handleFolderClick(cf)}
                                  className={`block w-full text-left px-3 py-3 min-h-[44px] text-sm rounded-lg transition-colors truncate touch-manipulation active:opacity-90 ${
                                    isChildSelected
                                      ? 'bg-green-power-100 text-green-power-800 font-semibold'
                                      : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                                >
                                  {cf.name || t('catalog.untitledFolder')}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
        </aside>

        {/* Divider between folder tree and main content */}
        <div className="hidden md:block w-1 flex-shrink-0 bg-gradient-to-b from-green-power-100 via-green-power-400 to-green-power-100 min-h-full self-stretch rounded-full" aria-hidden />

        {/* Main content – full height: PDF cards grid (PDF opens in /catalogue/view) */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white">
          <div className="flex-shrink-0 px-3 sm:px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-green-power-50 to-green-power-100">
            <h2 className="text-sm font-bold text-gray-900">{t('catalog.entriesTitle')}</h2>
            <p className="text-xs text-gray-600 mt-0.5">
              {selectedFolderId ? t('catalog.entriesSubtitle') : t('catalog.entriesSelectFolder')}
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 pb-[env(safe-area-inset-bottom)]">
                {!selectedFolderId ? (
                  <p className="text-sm text-gray-500 py-8 text-center px-2">{t('catalog.entriesSelectFolder')}</p>
                ) : entriesLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4" aria-busy="true" aria-label={t('common.loading')}>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="flex flex-col rounded-lg border border-gray-200 bg-white overflow-hidden animate-pulse w-full">
                        <div className="w-full bg-gray-200" style={{ aspectRatio: 3 / 2 }} />
                        <div className="p-2 sm:p-3 space-y-1.5">
                          <div className="h-3.5 bg-gray-200 rounded w-4/5" />
                          <div className="h-3 bg-gray-100 rounded w-full" />
                        </div>
                        <div className="p-2 sm:p-3 pt-0">
                          <div className="h-[44px] bg-gray-200 rounded-lg w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : entries.length === 0 ? (
                  <p className="text-sm text-gray-500 py-8 text-center px-2">{t('catalog.noEntries')}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4">
                    {entries.map((entry) => (
                      <article
                        key={entry.id}
                        className="flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow w-full"
                      >
                        <button
                          type="button"
                          className="block w-full text-left flex flex-col flex-1 min-w-0 touch-manipulation active:opacity-95"
                          onClick={() => openPdfInNewScreen(entry)}
                        >
                          <div className="relative w-full overflow-hidden bg-gray-100" style={{ aspectRatio: 3 / 2 }}>
                            <PdfThumbnail
                              fileUrl={entry.fileUrl}
                              alt={entry.name?.trim() || entry.fileName || 'PDF'}
                              className="absolute inset-0"
                              aspectRatio={3 / 2}
                            />
                          </div>
                          <div className="p-2 sm:p-3 flex flex-col flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 text-xs sm:text-sm truncate">{entry.name?.trim() || entry.fileName || 'PDF'}</h3>
                            {entry.description ? (
                              <p className="text-[11px] sm:text-xs text-gray-600 mt-0.5 line-clamp-2">{entry.description}</p>
                            ) : null}
                          </div>
                        </button>
                        <div className="p-2 sm:p-3 pt-0">
                          <button
                            type="button"
                            onClick={() => openPdfInNewScreen(entry)}
                            className="w-full rounded-lg py-2.5 px-3 min-h-[44px] text-xs sm:text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-all touch-manipulation active:scale-[0.98]"
                            style={{
                              background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 100%)',
                              boxShadow: '0 1px 4px rgba(93, 138, 106, 0.3)',
                            }}
                          >
                            {t('catalog.openPdf')}
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
        </main>
      </div>
    </div>
  );
}

