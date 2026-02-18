/** Folder path for admin-only private folder. Must match admin-panel folderStructure. Customers must never see or access this path. */
export const ADMIN_ONLY_FOLDER_PATH = '09_Admin_Only' as const;

/** Prefix for customer-created folders in the customer portal (e.g. "Material Items"). Stored per-project in project.customFolders. */
export const CUSTOM_FOLDER_PREFIX = '10_Custom' as const;

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
      { name: 'Acceptance_Protocols', path: '03_Reports/Acceptance_Protocols' },
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

