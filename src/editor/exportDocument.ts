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

// Named text styles referenced via text:style-name below, for the formatting toolbar's bold/
// italic/underline (see formatting.ts) -- ODF requires styles used this way to be declared
// somewhere; content.xml's own automatic-styles section is the simplest valid place for a
// document with no separate styles.xml. The list-style here (a style definition, not content) is
// what makes <ol>-derived lists render as "1. 2. 3." rather than falling back to whatever bullet a
// reader's default list style uses -- <ul>-derived lists intentionally don't reference a style at
// all, since an unstyled text:list already renders as bulleted in every ODF-conformant reader
// tested against (see README.md's LibreOffice round-trip note).
const AUTOMATIC_STYLES_XML =
  `<office:automatic-styles>` +
  `<style:style style:name="Bold" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>` +
  `<style:style style:name="Italic" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>` +
  `<style:style style:name="Underline" style:family="text">` +
  `<style:text-properties style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/>` +
  `</style:style>` +
  `<text:list-style style:name="OrderedList">` +
  `<text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix=".">` +
  `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"/>` +
  `</text:list-level-style-number>` +
  `</text:list-style>` +
  `</office:automatic-styles>`;

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
const INLINE_STYLE_TAGS: Record<string, string> = { B: "Bold", STRONG: "Bold", I: "Italic", EM: "Italic", U: "Underline" };

// Walks one block element's inline content into ODF content.xml markup: hyperlinks become
// <text:a>, bold/italic/underline become <text:span> referencing one of the automatic styles
// above, embedded-citation-text marks are flattened into a bracketed inline suffix (there's no
// simple ODF equivalent worth the complexity of a true office:annotation), and an already-expanded
// excerpt span is skipped so its text isn't duplicated (it's already folded into the note's
// bracketed suffix). Recurses so e.g. bold text inside a hyperlink, or a hyperlink inside a list
// item, serializes correctly regardless of nesting.
function inlineContentToOdtXml(node: Node): string {
  let inner = "";

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      inner += escapeXml(child.textContent || "");
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = child as HTMLElement;
    const styleName = INLINE_STYLE_TAGS[element.tagName];

    if (element.matches(HYPERLINK_SELECTOR)) {
      const href = element.getAttribute("href") || "";
      inner += `<text:a xlink:type="simple" xlink:href="${escapeXml(href)}">${inlineContentToOdtXml(element)}</text:a>`;
    } else if (element.classList.contains(EMBED_NOTE_CLASS)) {
      const excerpt = element.getAttribute("data-excerpt") || "";
      inner += `${inlineContentToOdtXml(element)} [Embedded citation text: ${escapeXml(excerpt)}]`;
    } else if (element.classList.contains(EMBED_EXCERPT_CLASS)) {
      // Skip: already folded into the preceding note's bracketed suffix above.
    } else if (styleName) {
      inner += `<text:span text:style-name="${styleName}">${inlineContentToOdtXml(element)}</text:span>`;
    } else {
      // An element type with no ODF equivalent worth modeling (e.g. a plain <div> line wrapper) --
      // drop the wrapper but keep walking its children rather than losing their content.
      inner += inlineContentToOdtXml(element);
    }
  });

  return inner;
}

const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

function listToOdtXml(list: HTMLElement): string {
  const styleAttr = list.tagName === "OL" ? ` text:style-name="OrderedList"` : "";
  const items = Array.from(list.children)
    .filter((el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "LI")
    .map((item) => `<text:list-item><text:p>${inlineContentToOdtXml(item)}</text:p></text:list-item>`)
    .join("");
  return `<text:list${styleAttr}>${items}</text:list>`;
}

// Dispatches one top-level block from the document surface to its ODF equivalent: a heading
// becomes <text:h> (so it survives as an actual heading, not just bold-looking text), a list
// becomes <text:list>, and everything else (a plain <p>, or any other wrapper) becomes <text:p>.
function blockToOdtXml(block: HTMLElement): string {
  if (HEADING_TAGS.has(block.tagName)) {
    const level = block.tagName.slice(1);
    return `<text:h text:outline-level="${level}">${inlineContentToOdtXml(block)}</text:h>`;
  }
  if (block.tagName === "UL" || block.tagName === "OL") {
    return listToOdtXml(block);
  }
  return `<text:p>${inlineContentToOdtXml(block)}</text:p>`;
}

function buildOdtContentXml(root: HTMLElement): string {
  const topLevelBlocks = Array.from(root.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
  const blocks = (topLevelBlocks.length > 0 ? topLevelBlocks : [root]).map(blockToOdtXml).join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<office:document-content ` +
    `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
    `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ` +
    `xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ` +
    `xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ` +
    `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `office:version="1.2">` +
    AUTOMATIC_STYLES_XML +
    `<office:body><office:text>${blocks}</office:text></office:body>` +
    `</office:document-content>`
  );
}

/**
 * Builds a minimal, valid ODF (.odt) package from the document surface: paragraphs, headings,
 * lists, hyperlinks, bold/italic/underline, and embedded citation notes (flattened to inline
 * bracketed text). Returns an ArrayBuffer rather than a Blob so this stays testable in jsdom,
 * which doesn't implement Blob.arrayBuffer() (see readFile.ts) -- the caller wraps it in a Blob
 * only at the point of triggering a download.
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
