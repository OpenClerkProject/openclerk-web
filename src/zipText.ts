import JSZip from "jszip";
import { readFileAsArrayBuffer } from "./readFile";

// Shared defense-in-depth limits for any zip-based document format this app reads (.docx, .odt):
// without them, a small maliciously-crafted zip can decompress to a huge amount of data in
// memory ("zip bomb") and hang or crash the page. Legitimate documents are always well within
// these caps. Same limits openclerk-word uses for its own .docx parsing (see word.ts).
const MAX_SOURCE_FILE_BYTES = 20 * 1024 * 1024; // 20 MB compressed upload
const MAX_ZIP_ENTRY_COUNT = 500;
const MAX_DECOMPRESSED_XML_BYTES = 50 * 1024 * 1024; // 50 MB per extracted XML part

// A single .docx/.odt XML part that claims to expand at more than this ratio is treated as a zip
// bomb and rejected *before* it is decompressed. Real document XML (markup plus prose) compresses
// at roughly 10-20:1; a part whose declared uncompressed:compressed ratio is above 200:1 is not a
// normal document, it's a run of repeated bytes crafted to blow up in memory once expanded. The
// floor below keeps this from tripping on a tiny, legitimately repetitive part (e.g. a near-empty
// content.xml) whose ratio is high but whose absolute expanded size is trivial.
const MAX_SAFE_COMPRESSION_RATIO = 200;
const COMPRESSION_RATIO_FLOOR_BYTES = 1 * 1024 * 1024; // 1 MB

// The zip central directory records each entry's declared compressed/uncompressed sizes. JSZip
// exposes them on an internal `_data` object rather than a public API, so this reads them
// defensively (typeof-guarded, undefined when absent) -- it lets us reject an oversized or
// absurdly-compressible entry from its declared header *before* calling entry.async(), which is
// what actually allocates the decompressed bytes. The values are attacker-controlled, but a zip
// bomb has to declare its true expanded size for a reader to allocate that much, so honoring these
// caps up front rejects the common case; the post-decompression length check stays as a backstop
// for a header that lies about being smaller than it is.
function readDeclaredEntrySizes(entry: JSZip.JSZipObject): {
  uncompressedSize?: number;
  compressedSize?: number;
} {
  const data = (entry as unknown as { _data?: unknown })._data;
  if (!data || typeof data !== "object") {
    return {};
  }
  const record = data as { uncompressedSize?: unknown; compressedSize?: unknown };
  return {
    uncompressedSize:
      typeof record.uncompressedSize === "number" ? record.uncompressedSize : undefined,
    compressedSize: typeof record.compressedSize === "number" ? record.compressedSize : undefined,
  };
}

/** Reads `file` as a zip archive, rejecting it outright if it's implausibly large for a document. */
export async function loadZipWithLimits(file: File): Promise<JSZip> {
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error(
      `File is too large (${Math.round(file.size / (1024 * 1024))} MB). The maximum supported size is ${
        MAX_SOURCE_FILE_BYTES / (1024 * 1024)
      } MB.`,
    );
  }

  const buffer = await readFileAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(buffer);

  const entryCount = Object.keys(zip.files).length;
  if (entryCount > MAX_ZIP_ENTRY_COUNT) {
    throw new Error(
      "The selected file contains an unexpectedly large number of entries and was rejected.",
    );
  }

  return zip;
}

/**
 * Reads a single zip entry as text, rejecting it if it's implausibly large. Each caller here
 * reads only one or two fixed entries (docxText.ts reads word/document.xml, odtText.ts reads
 * content.xml), so the per-entry cap below already bounds total decompressed memory; a cumulative
 * cross-entry budget would only matter for a caller that reads many entries from one archive.
 * TODO: thread a shared decompressed-byte accumulator through loadZipWithLimits if such a caller
 * is ever added.
 */
export async function readZipEntryWithLimit(zip: JSZip, path: string): Promise<string | undefined> {
  const entry = zip.file(path);
  if (!entry) {
    return undefined;
  }

  // Preflight against the entry's declared sizes *before* decompressing: entry.async("string")
  // allocates the full uncompressed content in memory, so a content.length check afterwards is
  // already too late to stop a zip bomb -- the memory is spent by then. See readDeclaredEntrySizes.
  const { uncompressedSize, compressedSize } = readDeclaredEntrySizes(entry);

  if (uncompressedSize !== undefined && uncompressedSize > MAX_DECOMPRESSED_XML_BYTES) {
    throw new Error("The selected file's contents are unexpectedly large and were rejected.");
  }

  if (
    uncompressedSize !== undefined &&
    compressedSize !== undefined &&
    compressedSize > 0 &&
    uncompressedSize > COMPRESSION_RATIO_FLOOR_BYTES &&
    uncompressedSize / compressedSize > MAX_SAFE_COMPRESSION_RATIO
  ) {
    throw new Error("The selected file's contents are unexpectedly large and were rejected.");
  }

  // Backstop: if the declared header lied about being small, this still catches the real expanded
  // size after decompression.
  const content = await entry.async("string");
  if (content.length > MAX_DECOMPRESSED_XML_BYTES) {
    throw new Error("The selected file's contents are unexpectedly large and were rejected.");
  }
  return content;
}
