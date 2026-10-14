/**
 * The two ways a stored file reaches the person at the screen.
 *
 * Both take a URL from one of the file actions — `/api/files/...`, never a
 * storage URL — and differ only in what the browser does with it. They live
 * together here because four components need the same pair, and because the
 * difference is easy to get wrong: a `window.open` onto a file the server
 * serves as an attachment leaves an empty tab behind on some browsers,
 * which looks like a failure.
 */

/** Opens the file in a new tab, for what a browser can display: PDFs, photos. */
export function openFile(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Saves the file instead of displaying it.
 *
 * A synthetic link click rather than a navigation, so the current page stays
 * exactly as it is — the route answers with `Content-Disposition:
 * attachment`, and the browser takes it from there.
 */
export function saveFile(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
