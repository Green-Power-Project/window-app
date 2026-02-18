/**
 * Captures the viewport or a specific element as an image and returns a File + preview URL.
 * When targetElement is provided (e.g. PDF container), only that area is captured.
 */
export interface ScreenshotResult {
  file: File;
  previewUrl: string;
}

const DEBUG_SCREENSHOT = typeof window !== 'undefined' && (window as any).__DEBUG_SCREENSHOT === true;

export async function captureViewport(targetElement?: HTMLElement | null): Promise<ScreenshotResult> {
  const html2canvas = (await import('html2canvas')).default;
  const element = targetElement && document.contains(targetElement) ? targetElement : document.body;

  if (DEBUG_SCREENSHOT) {
    const rect = element.getBoundingClientRect();
    const hasCanvas = element.querySelector?.('canvas');
    console.debug('[screenshot] capture target:', {
      tag: element.tagName,
      id: (element as HTMLElement).id || null,
      className: (element as HTMLElement).className?.slice?.(0, 80) || null,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      isBody: element === document.body,
      childCanvasCount: element.querySelectorAll?.('canvas').length ?? 0,
      innerHTMLLength: element.innerHTML?.length ?? 0,
    });
  }

  const canvas = await html2canvas(element, {
    allowTaint: true,
    useCORS: true,
    logging: DEBUG_SCREENSHOT,
    scale: window.devicePixelRatio || 1,
    ...(element === document.body
      ? {
          windowWidth: document.documentElement.scrollWidth,
          windowHeight: document.documentElement.scrollHeight,
        }
      : {}),
  });

  if (DEBUG_SCREENSHOT) {
    console.debug('[screenshot] html2canvas result:', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png', 0.9);
  });

  if (!blob) throw new Error('Failed to create screenshot');

  if (DEBUG_SCREENSHOT) {
    console.debug('[screenshot] blob:', { size: blob.size, type: blob.type });
  }

  const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
  const previewUrl = URL.createObjectURL(blob);
  return { file, previewUrl };
}
