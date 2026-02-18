/**
 * In-memory store to pass a captured screenshot from any page to the offer page.
 * Used when user clicks "Screenshot & request quote" – we capture, set here, navigate to /offer,
 * and the offer page reads and clears on mount.
 */
export interface StoredScreenshot {
  file: File;
  previewUrl: string;
}

const KEY = '__offerScreenshot';

declare global {
  interface Window {
    [KEY]?: StoredScreenshot;
  }
}

export function setOfferScreenshot(data: StoredScreenshot): void {
  if (typeof window === 'undefined') return;
  window[KEY] = data;
}

export function getAndClearOfferScreenshot(): StoredScreenshot | null {
  if (typeof window === 'undefined') return null;
  const data = window[KEY] ?? null;
  delete window[KEY];
  return data;
}
