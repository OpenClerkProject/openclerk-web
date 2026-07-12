import { loadZipWithLimits, readZipEntryWithLimit } from "./zipText";

// OpenDocument Text (.odt) namespace for paragraph/heading content. Unlike .docx (whose document
// lives at word/document.xml), an .odt's document body is content.xml at the zip root.
const TEXT_NS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";

/**
 * Collects every <text:p> (paragraph) and <text:h> (heading -- a distinct tag from paragraph in
 * ODF, unlike Word's headings-are-just-styled-paragraphs model) in document order. A TreeWalker
 * naturally visits nodes in document order, so headings interleaved between paragraphs come out
 * in the right place without a manual sort.
 */
function collectTextBlocks(documentDom: Document): Element[] {
  const blocks: Element[] = [];
  const walker = documentDom.createTreeWalker(documentDom, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const element = node as Element;
      return element.namespaceURI === TEXT_NS && (element.localName === "p" || element.localName === "h")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });

  let node = walker.nextNode();
  while (node) {
    blocks.push(node as Element);
    node = walker.nextNode();
  }
  return blocks;
}

/** Extracts the full plain-text body of an .odt file, one line per paragraph/heading. */
export async function extractOdtText(file: File): Promise<string> {
  const zip = await loadZipWithLimits(file);

  const contentXml = await readZipEntryWithLimit(zip, "content.xml");
  if (!contentXml) {
    throw new Error("The selected file is not a valid OpenDocument Text (.odt) document.");
  }

  const parser = new DOMParser();
  const documentDom = parser.parseFromString(contentXml, "application/xml");
  const blocks = collectTextBlocks(documentDom);

  return blocks.map((block) => block.textContent || "").join("\n");
}
