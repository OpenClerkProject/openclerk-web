// OpenClerk Studio's scribe.js glue -- a hand-authored, native-ES-module file that is copied
// verbatim into dist/ (see scripts/build.js) and NEVER processed by esbuild. It has to bypass the
// bundler because scribe.js-ocr cannot be bundled by esbuild at all: its module graph statically
// references a native `.node` skia addon and Node builtins (behind runtime `typeof process` guards
// that never fire in a browser, but which esbuild still tries to resolve at build time and fails
// on). scribe also forbids CDN loading -- all of its files must be same-origin -- so it is
// self-hosted under dist/scribe/ and imported here by relative path.
//
// This module is loaded lazily (studio/chrome.ts injects it as a <script type="module"> only when
// a PDF operation is first requested), and it just exposes two operations on `window`; the heavy
// WASM/worker/font loading inside scribe happens later still, when those operations actually run.
// It runs ONLY on the OpenClerk Studio page -- the PDF & OCR Tools page and the plain Document
// Editor keep using tesseract.js, untouched.

import scribe from "./scribe/scribe.js";

// Self-host the Tesseract language data same-origin (rather than scribe's default jsdelivr CDN),
// so nothing is fetched from a third party -- consistent with OpenClerk's "nothing leaves your
// browser" model. Resolved from this module's own URL so it's correct regardless of the deploy
// subpath (e.g. a project GitHub Pages site served under /openclerk-web/).
scribe.opt.langPath = new URL("./scribe-lang/", import.meta.url).href;

/**
 * Maps scribe's recognized document into the same PageExtraction[] shape the existing
 * pdf.js+tesseract path returns ({ pageNumber, text, source }), so editor/main.ts consumes it
 * with no changes. `source` is an approximation for the page-count summary: a text-native PDF
 * yields "embedded", an image/scanned one "ocr", an empty page "empty".
 */
async function runRecognition(file, onProgress) {
  scribe.opt.progressHandler = (msg) => {
    if (msg && msg.type === "recognize" && typeof msg.n === "number" && onProgress) {
      onProgress(`Running OCR on page ${msg.n + 1}...`);
    }
  };
  onProgress?.("Loading the PDF...");
  const doc = await scribe.openDocument([file]);
  onProgress?.("Recognizing text (this can take a while for scanned pages)...");
  await doc.recognize({ langs: ["eng"] });
  return doc;
}

async function extractPdfText(file, options = {}) {
  const onProgress = options.onProgress;
  const doc = await runRecognition(file, onProgress);
  try {
    const pageCount = doc.inputData?.pageCount ?? 0;
    const isTextNative = doc.inputData?.pdfType === "text";
    const pages = [];
    for (let i = 0; i < pageCount; i++) {
      const raw = await doc.exportData("txt", { minPage: i, maxPage: i });
      const text = (typeof raw === "string" ? raw : "").trim();
      const source = isTextNative ? "embedded" : text ? "ocr" : "empty";
      pages.push({ pageNumber: i + 1, text, source });
    }
    return pages;
  } finally {
    await doc.terminate();
  }
}

async function exportSearchablePdf(file, options = {}) {
  const onProgress = options.onProgress;
  const doc = await runRecognition(file, onProgress);
  try {
    onProgress?.("Building the searchable PDF...");
    // A PDF with scribe's invisible OCR text layer over the original page images: selectable,
    // searchable, and with the detected font styles preserved. Returned as an ArrayBuffer; the
    // caller wraps it in a Blob to download.
    return await doc.exportData("pdf");
  } finally {
    await doc.terminate();
  }
}

window.__openclerkScribe = { extractPdfText, exportSearchablePdf };
