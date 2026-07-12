import JSZip from "jszip";
import { readFileAsArrayBuffer } from "./readFile";

// Shared defense-in-depth limits for any zip-based document format this app reads (.docx, .odt):
// without them, a small maliciously-crafted zip can decompress to a huge amount of data in
// memory ("zip bomb") and hang or crash the page. Legitimate documents are always well within
// these caps. Same limits openclerk-word uses for its own .docx parsing (see word.ts).
const MAX_SOURCE_FILE_BYTES = 20 * 1024 * 1024; // 20 MB compressed upload
const MAX_ZIP_ENTRY_COUNT = 500;
const MAX_DECOMPRESSED_XML_BYTES = 50 * 1024 * 1024; // 50 MB per extracted XML part

/** Reads `file` as a zip archive, rejecting it outright if it's implausibly large for a document. */
export async function loadZipWithLimits(file: File): Promise<JSZip> {
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

  return zip;
}

/** Reads a single zip entry as text, rejecting it if the decompressed content is implausibly large. */
export async function readZipEntryWithLimit(zip: JSZip, path: string): Promise<string | undefined> {
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
