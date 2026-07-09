import JSZip from "jszip";
import { readFileAsArrayBuffer } from "./readFile";

// Same defense-in-depth limits openclerk-word uses for its own .docx parsing (zip bombs, huge
// entry counts, huge decompressed XML) -- see src/taskpane/word.ts's parseSourceDocument in that
// repo. This module extracts the full body text instead of just hyperlinked runs, since there's
// no live document here to search/hyperlink against -- the extracted text is just scanned for
// citations the same way pasted text is.
const MAX_SOURCE_FILE_BYTES = 20 * 1024 * 1024; // 20 MB compressed upload
const MAX_ZIP_ENTRY_COUNT = 500;
const MAX_DECOMPRESSED_XML_BYTES = 50 * 1024 * 1024; // 50 MB per extracted XML part

const WORDPROCESSING_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

async function readZipEntryWithLimit(zip: JSZip, path: string): Promise<string | undefined> {
  const entry = zip.file(path);
  if (!entry) {
    return undefined;
  }
  const content = await entry.async("string");
  if (content.length > MAX_DECOMPRESSED_XML_BYTES) {
    throw new Error("The selected file's contents are unexpectedly large and were rejected.");
  }
  return content;
}

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
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error(
      `File is too large (${Math.round(file.size / (1024 * 1024))} MB). The maximum supported size is ${
        MAX_SOURCE_FILE_BYTES / (1024 * 1024)
      } MB.`
    );
  }

  const buffer = await readFileAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(buffer);

  const entryCount = Object.keys(zip.files).length;
  if (entryCount > MAX_ZIP_ENTRY_COUNT) {
    throw new Error("The selected file contains an unexpectedly large number of entries and was rejected.");
  }

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
