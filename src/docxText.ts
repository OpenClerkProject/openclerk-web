import { loadZipWithLimits, readZipEntryWithLimit } from "./zipText";

// This module extracts the full body text instead of just hyperlinked runs, since there's no
// live document here to search/hyperlink against -- the extracted text is just scanned for
// citations the same way pasted text is. Zip-bomb/oversized-content defenses live in zipText.ts,
// shared with odtText.ts.

const WORDPROCESSING_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function getParagraphText(paragraph: Element): string {
  const textNodes = paragraph.getElementsByTagNameNS(WORDPROCESSING_NS, "t");
  let result = "";
  for (let index = 0; index < textNodes.length; index += 1) {
    result += textNodes[index].textContent || "";
  }
  return result;
}

/** Extracts the full plain-text body of a .docx file, one line per paragraph. */
export async function extractDocxText(file: File): Promise<string> {
  const zip = await loadZipWithLimits(file);

  const documentXml = await readZipEntryWithLimit(zip, "word/document.xml");
  if (!documentXml) {
    throw new Error("The selected file is not a valid Word (.docx) document.");
  }

  const parser = new DOMParser();
  const documentDom = parser.parseFromString(documentXml, "application/xml");
  const paragraphs = documentDom.getElementsByTagNameNS(WORDPROCESSING_NS, "p");

  const lines: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    lines.push(getParagraphText(paragraphs[index]));
  }

  return lines.join("\n");
}
