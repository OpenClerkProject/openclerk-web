import JSZip from "jszip";
import { getPlainText } from "./dom";
import { CASE_HYPERLINK_CLASS, PARENTHETICAL_HYPERLINK_CLASS, EMBED_NOTE_CLASS, EMBED_EXCERPT_CLASS } from "./markers";

const ODT_MIME_TYPE = "application/vnd.oasis.opendocument.text";

const MANIFEST_XML =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">` +
  `<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="${ODT_MIME_TYPE}"/>` +
  `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
  `</manifest:manifest>`;

/** Plain-text export of the document surface -- just what's already used to scan for citations. */
export function buildPlainTextExport(root: HTMLElement): string {
  return getPlainText(root);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const HYPERLINK_SELECTOR = `a.${CASE_HYPERLINK_CLASS}, a.${PARENTHETICAL_HYPERLINK_CLASS}`;

// Walks one paragraph's children into ODF content.xml markup: hyperlinks become <text:a>,
// embedded-citation-text marks are flattened into a bracketed inline suffix (there's no simple
// ODF equivalent worth the complexity of a true office:annotation -- see exportDocument's use in
// main.ts for why), and an already-expanded excerpt span is skipped so its text isn't duplicated
// (it's already folded into the note's bracketed suffix).
function paragraphToOdtXml(paragraph: HTMLElement): string {
  let inner = "";

  paragraph.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      inner += escapeXml(child.textContent || "");
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = child as HTMLElement;
    if (element.matches(HYPERLINK_SELECTOR)) {
      const href = element.getAttribute("href") || "";
      inner += `<text:a xlink:type="simple" xlink:href="${escapeXml(href)}">${escapeXml(element.textContent || "")}</text:a>`;
    } else if (element.classList.contains(EMBED_NOTE_CLASS)) {
      const excerpt = element.getAttribute("data-excerpt") || "";
      inner += `${escapeXml(element.textContent || "")} [Embedded citation text: ${escapeXml(excerpt)}]`;
    } else if (element.classList.contains(EMBED_EXCERPT_CLASS)) {
      // Skip: already folded into the preceding note's bracketed suffix above.
    } else {
      inner += escapeXml(element.textContent || "");
    }
  });

  return `<text:p>${inner}</text:p>`;
}

function buildOdtContentXml(root: HTMLElement): string {
  const paragraphs = Array.from(root.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
  const blocks = (paragraphs.length > 0 ? paragraphs : [root]).map(paragraphToOdtXml).join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<office:document-content ` +
    `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
    `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ` +
    `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `office:version="1.2">` +
    `<office:body><office:text>${blocks}</office:text></office:body>` +
    `</office:document-content>`
  );
}

/**
 * Builds a minimal, valid ODF (.odt) package from the document surface: paragraphs, hyperlinks,
 * and embedded citation notes (flattened to inline bracketed text). Returns an ArrayBuffer rather
 * than a Blob so this stays testable in jsdom, which doesn't implement Blob.arrayBuffer() (see
 * readFile.ts) -- the caller wraps it in a Blob only at the point of triggering a download.
 */
export async function buildOdtArchive(root: HTMLElement): Promise<ArrayBuffer> {
  const zip = new JSZip();
  // The ODF spec requires "mimetype" to be the first entry and stored uncompressed.
  zip.file("mimetype", ODT_MIME_TYPE, { compression: "STORE" });
  zip.file("META-INF/manifest.xml", MANIFEST_XML);
  zip.file("content.xml", buildOdtContentXml(root));
  return zip.generateAsync({ type: "arraybuffer" });
}

/** Triggers a browser download of `data` as `filename`. */
export function downloadFile(data: string | ArrayBuffer, filename: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
