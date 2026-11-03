export type ExportResult = 'shared' | 'saved' | 'cancelled';

/**
 * Hands a text file to the person. On iPhone and Android the share sheet is the dependable route (a hidden
 * download link is often ignored in an installed app), so it is tried first; everything else falls back to a
 * normal download. Cancelling the share sheet is not a failure.
 */
export async function exportTextFile(filename: string, text: string, mime = 'application/json'): Promise<ExportResult> {
  try {
    if (typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      const file = new File([text], filename, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return 'shared';
        } catch (error) {
          if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
          // Any other share failure falls through to a download.
        }
      }
    }
  } catch { /* feature detection failed: download instead */ }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking straight away can cancel the download on some browsers; give it time to start.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'saved';
}
