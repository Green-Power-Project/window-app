'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Folder, PROJECT_FOLDER_STRUCTURE } from '@/lib/folderStructure';

interface FolderTreeProps {
  projectId: string;
}

function FolderItem({ folder, level = 0, projectId }: { folder: Folder; level?: number; projectId: string }) {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const hasChildren = folder.children && folder.children.length > 0;

  const handleExpandClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const folderUrl = `/project/${projectId}/folder/${folder.path}`;

  const indentLevel = level * 1.5;

  return (
    <div>
      <div
        className="flex items-center py-1.5 text-sm hover:bg-gray-50"
        style={{ paddingLeft: `${indentLevel + 0.75}rem` }}
      >
        {hasChildren && (
          <button
            onClick={handleExpandClick}
            className="mr-2 text-gray-400 text-xs w-3 hover:text-gray-600"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        )}
        {!hasChildren && <span className="mr-2 text-gray-300 text-xs w-3">•</span>}
        <Link
          href={folderUrl}
          className="text-gray-700 font-normal hover:text-green-power-600 flex-1"
        >
          {folder.name}
        </Link>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {folder.children!.map((child) => (
            <FolderItem
              key={child.path}
              folder={child}
              level={level + 1}
              projectId={projectId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectFolderTree({ projectId }: FolderTreeProps) {
  return (
    <div className="border border-gray-200 rounded-sm bg-white">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">Project Folders</h3>
        <p className="text-xs text-gray-500 mt-0.5">Fixed folder structure (read-only)</p>
      </div>
      <div>
        {PROJECT_FOLDER_STRUCTURE.map((folder, index) => (
          <div key={folder.path} className={index > 0 ? 'border-t border-gray-100' : ''}>
            <FolderItem
              folder={folder}
              projectId={projectId}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

