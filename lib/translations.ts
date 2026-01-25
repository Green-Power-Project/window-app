import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Translate a folder path to a display name
 * @param folderPath - The folder path (e.g., "03_Reports/Daily_Reports")
 * @param t - Translation function from useLanguage hook
 * @returns Translated folder name or formatted fallback
 */
export function translateFolderPath(folderPath: string, t: (key: string) => string): string {
  // Try to get translation from folders object
  const translationKey = `folders.${folderPath}`;
  const translated = t(translationKey);
  
  // If translation exists (not the key itself), return it
  if (translated !== translationKey) {
    return translated;
  }
  
  // Fallback: format the folder name (remove numbering and underscores)
  const lastSegment = folderPath.split('/').pop() || folderPath;
  return lastSegment.replace(/^\d+_/, '').replace(/_/g, ' ');
}

/**
 * Translate a status label
 * @param status - Status value (e.g., "approved", "pending", "read", "unread")
 * @param t - Translation function from useLanguage hook
 * @returns Translated status label
 */
export function translateStatus(status: string, t: (key: string) => string): string {
  const statusKey = status.toLowerCase();
  const translationKey = `status.${statusKey}`;
  const translated = t(translationKey);
  
  // If translation exists (not the key itself), return it
  if (translated !== translationKey) {
    return translated;
  }
  
  // Fallback: capitalize first letter
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Get folder display name from folder path
 * This is a helper that can be used in components that have access to useLanguage
 */
export function getFolderDisplayName(folderPath: string, t: (key: string) => string): string {
  return translateFolderPath(folderPath, t);
}
