/** Saves text produced in the browser as a file (CSV, JSON exports). */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Lets the browser download a URL itself (streamed to disk, never held in page memory). */
export function downloadUrl(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  link.click();
}
