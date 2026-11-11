/** Saves text produced in the browser as a file (CSV, JSON exports). */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Lets the browser download a URL itself (streamed to disk, never held in page memory).
 *
 * The `download` attribute makes the click a download rather than a navigation: without it the
 * browser starts leaving the page, which cancels the requests in flight (server actions, the
 * live jobs stream) and, in Firefox while the save dialog is open, breaks the page. The file
 * name still comes from the response's `Content-Disposition`.
 */
export function downloadUrl(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  link.rel = 'noopener';
  link.click();
}
