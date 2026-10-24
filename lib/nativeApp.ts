/** True when running inside the App Store iOS shell (WKWebView), not Safari. */
export function isNativeIOSApp(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as Window & { __GRUNPOWER_NATIVE_IOS__?: boolean }).__GRUNPOWER_NATIVE_IOS__) {
    return true;
  }
  return document.cookie.includes('app-platform=iOS%20App%20Store')
    || document.cookie.includes('app-platform=iOS App Store');
}

export function nativeOneSignalLogin(externalUserId: string): void {
  const handler = (window as Window & { webkit?: { messageHandlers?: Record<string, { postMessage: (body: string) => void }> } })
    .webkit?.messageHandlers?.['onesignal-login'];
  if (handler) {
    handler.postMessage(externalUserId);
  }
}

export function nativeOneSignalLogout(): void {
  const handler = (window as Window & { webkit?: { messageHandlers?: Record<string, { postMessage: (body: string) => void }> } })
    .webkit?.messageHandlers?.['onesignal-logout'];
  if (handler) {
    handler.postMessage('');
  }
}
