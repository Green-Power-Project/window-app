/** Folder path for admin-only private folder. Must match admin-panel folderStructure. Customers must never see or access this path. */
export const ADMIN_ONLY_FOLDER_PATH = '09_Admin_Only' as const;

/** Prefix for customer-created folders in the customer portal (e.g. "Material Items"). Stored per-project in project.customFolders. */
export const CUSTOM_FOLDER_PREFIX = '10_Custom' as const;

/** PDF review + signing (must match admin-panel `folderStructure`). */
export const SIGNABLE_DOCUMENT_FOLDER_PATHS = [
  'Signature/Offers',
  'Signature/Order_Confirmations',
  'Signature/Variations_Additional_Work',
  'Signature/Delivery_Notes',
  'Signature/Reports',
  'Signature/Contracts',
  'Signature/Documentation',
  // Previous signature-folder names kept for backward compatibility.
  'Signature/Offers_Quotations',
  'Signature/Additions_Change_Orders',
  // Legacy paths kept for backward compatibility with older projects.
  '11_Signature_Required_Documents/Signable_Documents',
  '12_Signed_Delivery_Notes/Signable_Documents',
  '13_Signed_Offers_Change_Orders/Signable_Documents',
] as const;

export function isSignableDocumentsFolderPath(folderPath: string): boolean {
  return (SIGNABLE_DOCUMENT_FOLDER_PATHS as readonly string[]).includes(folderPath);
}

export const SIGNABLE_DOCUMENTS_FOLDER_PATH = SIGNABLE_DOCUMENT_FOLDER_PATHS[0];

const LEGACY_FIXED_FOLDER_PATHS = new Set<string>([
  '11_Signature_Required_Documents',
  '11_Signature_Required_Documents/Signable_Documents',
  '12_Signed_Delivery_Notes',
  '12_Signed_Delivery_Notes/Signable_Documents',
  '13_Signed_Offers_Change_Orders',
  '13_Signed_Offers_Change_Orders/Signable_Documents',
]);

export function isAdminOnlyFolderPath(folderPath: string): boolean {
  return folderPath === ADMIN_ONLY_FOLDER_PATH || folderPath.startsWith(`${ADMIN_ONLY_FOLDER_PATH}/`);
}

export function isCustomFolderPath(folderPath: string): boolean {
  return folderPath.startsWith(`${CUSTOM_FOLDER_PREFIX}/`);
}

/**
 * Sanitize a user-entered folder name into a safe path segment (e.g. "Paving" -> "Paving").
 */
export function sanitizeCustomFolderName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'New_Folder';
}

/**
 * Build full path for a custom folder from display name.
 */
export function toCustomFolderPath(displayName: string): string {
  return `${CUSTOM_FOLDER_PREFIX}/${sanitizeCustomFolderName(displayName)}`;
}

export interface Folder {
  name: string;
  path: string;
  children?: Folder[];
}

// Helper function to format folder names: remove serial numbers and replace underscores with spaces
export function formatFolderName(path: string): string {
  // Remove serial numbers at the start (e.g., "00_", "01_")
  let formatted = path.replace(/^\d+_/, '');
  // Replace underscores with spaces
  formatted = formatted.replace(/_/g, ' ');
  // Special case: rename "Customer Uploads" to "Your Uploads"
  formatted = formatted.replace(/^Customer Uploads$/i, 'Your Uploads');
  return formatted;
}
// FIXED FOLDER STRUCTURE
export const PROJECT_FOLDER_STRUCTURE: Folder[] = [
  {
    name: '01_Customer_Uploads',
    path: '01_Customer_Uploads',
    children: [
      { name: 'Photos', path: '01_Customer_Uploads/Photos' },
      { name: 'Documents', path: '01_Customer_Uploads/Documents' },
      { name: 'Other', path: '01_Customer_Uploads/Other' },
    ],
  },
  {
    name: '03_Reports',
    path: '03_Reports',
    children: [
      { name: 'Daily_Reports', path: '03_Reports/Daily_Reports' },
      { name: 'Weekly_Reports', path: '03_Reports/Weekly_Reports' },
    ],
  },
  {
    name: 'Signature',
    path: 'Signature',
    children: [
      { name: 'Offers', path: 'Signature/Offers' },
      { name: 'Order_Confirmations', path: 'Signature/Order_Confirmations' },
      { name: 'Variations_Additional_Work', path: 'Signature/Variations_Additional_Work' },
      { name: 'Delivery_Notes', path: 'Signature/Delivery_Notes' },
      { name: 'Reports', path: 'Signature/Reports' },
      { name: 'Contracts', path: 'Signature/Contracts' },
      { name: 'Documentation', path: 'Signature/Documentation' },
    ],
  },
  {
    name: '05_Quotations',
    path: '05_Quotations',
    children: [
      { name: 'Drafts', path: '05_Quotations/Drafts' },
      { name: 'Approved', path: '05_Quotations/Approved' },
      { name: 'Rejected', path: '05_Quotations/Rejected' },
    ],
  },
  {
    name: '06_Invoices',
    path: '06_Invoices',
    children: [
      { name: 'Progress_Invoices', path: '06_Invoices/Progress_Invoices' },
      { name: 'Final_Invoices', path: '06_Invoices/Final_Invoices' },
      { name: 'Credit_Notes', path: '06_Invoices/Credit_Notes' },
    ],
  },
  {
    name: '07_Delivery_Notes',
    path: '07_Delivery_Notes',
    children: [
      { name: 'Material_Delivery_Notes', path: '07_Delivery_Notes/Material_Delivery_Notes' },
      { name: 'Piecework_Delivery_Notes', path: '07_Delivery_Notes/Piecework_Delivery_Notes' },
      { name: 'Reports_Linked_to_Delivery_Notes', path: '07_Delivery_Notes/Reports_Linked_to_Delivery_Notes' },
    ],
  },
  {
    name: '08_General',
    path: '08_General',
    children: [
      { name: 'Contracts', path: '08_General/Contracts' },
      { name: 'Plans', path: '08_General/Plans' },
      { name: 'Other_Documents', path: '08_General/Other_Documents' },
    ],
  },
  {
    name: '02_Photos',
    path: '02_Photos',
    children: [
      { name: 'Before', path: '02_Photos/Before' },
      { name: 'During_Work', path: '02_Photos/During_Work' },
      { name: 'After', path: '02_Photos/After' },
      { name: 'Damages_and_Defects', path: '02_Photos/Damages_and_Defects' },
    ],
  },
  {
    name: '04_Emails',
    path: '04_Emails',
    children: [
      { name: 'Incoming', path: '04_Emails/Incoming' },
      { name: 'Outgoing', path: '04_Emails/Outgoing' },
    ],
  },
];

/**
 * Merge Firestore `dynamicSubfolders` (extra subfolders per top-level path) into the fixed tree.
 * Keys are parent paths (e.g. `03_Reports`); values are sanitized segment names (e.g. `["Site_Visit"]`).
 *
 * **Single source of truth:** both admin and customer read/write `projects/{id}.dynamicSubfolders`
 * on the same Firestore document. Real-time listeners (`onSnapshot`) update each UI when the
 * other role adds subfolders. Use `appendDynamicSubfolderTransaction` for atomic appends.
 */
export function mergeDynamicSubfolders(
  base: Folder[],
  dynamicSubfolders?: Record<string, string[]> | null
): Folder[] {
  if (!dynamicSubfolders || Object.keys(dynamicSubfolders).length === 0) {
    return base.map((f) => ({
      ...f,
      children: f.children ? f.children.map((c) => ({ ...c })) : undefined,
    }));
  }
  return base.map((folder) => {
    const extra = dynamicSubfolders[folder.path];
    const existingChildren = folder.children ? folder.children.map((c) => ({ ...c })) : [];
    if (!extra?.length) {
      return { ...folder, children: existingChildren.length ? existingChildren : undefined };
    }
    const existingPaths = new Set(existingChildren.map((c) => c.path));
    const dynamicChildren: Folder[] = extra
      .filter((seg) => seg && !existingPaths.has(`${folder.path}/${seg}`))
      .map((seg) => ({
        name: seg,
        path: `${folder.path}/${seg}`,
      }));
    if (!dynamicChildren.length) {
      return { ...folder, children: existingChildren.length ? existingChildren : undefined };
    }
    const merged = [...existingChildren, ...dynamicChildren].sort((a, b) => a.path.localeCompare(b.path));
    return { ...folder, children: merged };
  });
}

/** True if path exists in the fixed PROJECT_FOLDER_STRUCTURE (any depth used there). */
export function isPathInFixedStructure(folderPath: string): boolean {
  if (LEGACY_FIXED_FOLDER_PATHS.has(folderPath)) return true;
  for (const f of PROJECT_FOLDER_STRUCTURE) {
    if (f.path === folderPath) return true;
    if (f.children) {
      for (const c of f.children) {
        if (c.path === folderPath) return true;
        if (c.children) {
          for (const g of c.children) {
            if (g.path === folderPath) return true;
          }
        }
      }
    }
  }
  return false;
}

/** True if path is a project-defined dynamic subfolder (`parent/sanitizedSegment`). */
export function isDynamicSubfolderPath(
  folderPath: string,
  dynamicSubfolders?: Record<string, string[]> | null
): boolean {
  if (!dynamicSubfolders) return false;
  const parts = folderPath.split('/').filter(Boolean);
  if (parts.length !== 2) return false;
  const [parent, seg] = parts;
  const list = dynamicSubfolders[parent];
  return Array.isArray(list) && list.includes(seg);
}

/** Customer portal: folder path is allowed if fixed, custom, or dynamic subfolder (not admin-only). */
export function isCustomerAllowedFolderPath(
  folderPath: string,
  project: { customFolders?: string[]; dynamicSubfolders?: Record<string, string[]> } | null | undefined
): boolean {
  if (!project) return false;
  if (isAdminOnlyFolderPath(folderPath)) return false;
  if (isPathInFixedStructure(folderPath)) return true;
  if (isCustomFolderPath(folderPath) && project.customFolders?.includes(folderPath)) return true;
  if (isDynamicSubfolderPath(folderPath, project.dynamicSubfolders)) return true;
  return false;
}

