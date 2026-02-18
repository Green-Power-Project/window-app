/**
 * Captures the viewport or a specific element as an image and returns a File + preview URL.
 * When targetElement is provided (e.g. PDF container), only that area is captured.
 */
export interface ScreenshotResult {
  file: File;
  previewUrl: string;
}

export async function captureViewport(targetElement?: HTMLElement | null): Promise<ScreenshotResult> {
  const html2canvas = (await import('html2canvas')).default;
  const element = targetElement && document.contains(targetElement) ? targetElement : document.body;
  const canvas = await html2canvas(element, {
    allowTaint: true,
    useCORS: true,
    logging: false,
    scale: window.devicePixelRatio || 1,
    ...(element === document.body
      ? {
          windowWidth: document.documentElement.scrollWidth,
          windowHeight: document.documentElement.scrollHeight,
        }
      : {}),
  });

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png', 0.9);
  });

  if (!blob) throw new Error('Failed to create screenshot');

  const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
  const previewUrl = URL.createObjectURL(blob);
  return { file, previewUrl };
}
