'use client';

import { useEffect, useState } from 'react';

interface FileUploadPreviewModalProps {
  isOpen: boolean;
  file: File | null;
  folderPath: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function FileUploadPreviewModal({
  isOpen,
  file,
  folderPath,
  onConfirm,
  onCancel,
}: FileUploadPreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'image' | 'pdf' | 'file'>('file');

  useEffect(() => {
    if (!file || !isOpen) {
      setPreviewUrl(null);
      setFileType('file');
      return;
    }

    // Determine file type
    const fileName = file.name.toLowerCase();
    let detectedType: 'image' | 'pdf' | 'file' = 'file';
    if (fileName.endsWith('.pdf')) {
      detectedType = 'pdf';
    } else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png')) {
      detectedType = 'image';
    }
    
    setFileType(detectedType);

    // Create preview URL for images
    if (detectedType === 'image') {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPreviewUrl(null);
    }
  }, [file, isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !file) return null;

  const renderPreview = () => {
    if (fileType === 'image' && previewUrl) {
      return (
        <div className="flex justify-center">
          <img
            src={previewUrl}
            alt="Preview"
            className="max-h-[70vh] max-w-full rounded-lg object-contain"
          />
        </div>
      );
    } else if (fileType === 'pdf') {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-gray-300 bg-gray-50 p-8">
          <svg
            className="h-16 w-16 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        </div>
      );
    } else {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-gray-300 bg-gray-50 p-8">
          <svg
            className="h-16 w-16 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        </div>
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative transform overflow-hidden rounded-lg bg-white shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            {/* Preview Only */}
            {renderPreview()}
          </div>

          {/* Buttons */}
          <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:items-center sm:gap-3 sm:px-6">
            <div className="hidden sm:block flex-shrink-0">
              <img src="/logo.png" alt="" className="w-8 h-8 object-contain" aria-hidden />
            </div>
            <button
              type="button"
              className="inline-flex w-full justify-center items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 focus:ring-green-500 sm:ml-auto sm:w-auto"
              onClick={onConfirm}
            >
              <img src="/logo.png" alt="" className="w-5 h-5 object-contain sm:hidden" aria-hidden />
              Upload File
            </button>
            <button
              type="button"
              className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
