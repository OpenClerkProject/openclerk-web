// OpenClerk Studio's scribe.js glue -- a hand-authored, native-ES-module file that is copied
// verbatim into dist/ (see scripts/build.js) and NEVER processed by esbuild. It has to bypass the
// bundler because scribe.js-ocr cannot be bundled by esbuild at all: its module graph statically
// references a native `.node` skia addon and Node builtins (behind runtime `typeof process` guards
// that never fire in a browser, but which esbuild still tries to resolve at build time and fails
// on). scribe also forbids CDN loading -- all of its files must be same-origin -- so it is
// self-hosted under dist/scribe/ and imported here by relative path.
//
// This module is loaded lazily (studio/chrome.ts injects it as a <script type="module"> only when
// a PDF operation is first requested), and it exposes a handful of operations on `window`
// (plain-text extraction, a styled/Markdown import, a searchable-PDF export, and a PDF-to-Word
// conversion); the heavy WASM/worker/font loading inside scribe happens later still, when those
// operations actually run.
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

// Words scribe recognized below this confidence (0-100) are worth a human's eye. 70 flags the
// genuinely-shaky tokens (garbled OCR) without drowning the reader in false positives -- on the
// Mata fixture this is ~2% of words.
const LOW_CONFIDENCE_THRESHOLD = 70;

// Whether a low-confidence token is *distinctive* enough to highlight every occurrence of. The
// caller has only the set of doubted word strings (not their positions), so it marks all
// occurrences -- which is only sensible for tokens that are consistently garbled OCR (e.g.
// "Affirma", "AVIAN", "22-cv-1461"), not for common words like "of"/"on"/"in" that merely scored
// low once and appear all over a legal document. Requiring an alphanumeric core of >= 5 (or any
// digit) keeps the genuine garbles and drops the short common words and word-fragments.
function isDistinctiveToken(text) {
  const core = text.replace(/[^A-Za-z0-9]/g, "");
  return /[A-Za-z]/.test(core) && (core.length >= 5 || /[0-9]/.test(core));
}

// Collects the distinct, distinctive word strings scribe was least sure about, from its OCR model
// (doc.ocr.active -> pars -> lines -> words, each carrying a .conf). The caller (studio/chrome.ts)
// highlights occurrences of these in the imported document.
function collectLowConfidenceWords(doc) {
  const words = new Set();
  let wordCount = 0;
  for (const page of doc.ocr?.active || []) {
    for (const par of page.pars || []) {
      for (const line of par.lines || []) {
        for (const word of line.words || []) {
          wordCount += 1;
          const text = (word.text || "").trim();
          if (typeof word.conf === "number" && word.conf < LOW_CONFIDENCE_THRESHOLD && isDistinctiveToken(text)) {
            words.add(text);
          }
        }
      }
    }
  }
  return { lowConfidenceWords: [...words], wordCount };
}

// OCRs (or reads, for a text-native PDF) a PDF and returns scribe's Markdown rendering plus the
// low-confidence review data. Markdown -- not scribe's HTML export, which is an absolute-positioned
// visual page reproduction -- is the clean semantic source: it carries headings, bold/italic, lists
// and *tables* as ordinary Markdown, which studio/chrome.ts turns into editable document HTML.
async function importPdfData(file, options = {}) {
  const onProgress = options.onProgress;
  const doc = await runRecognition(file, onProgress);
  try {
    onProgress?.("Formatting the recognized text...");
    const markdown = await doc.exportData("md");
    const { lowConfidenceWords, wordCount } = collectLowConfidenceWords(doc);
    return {
      markdown: typeof markdown === "string" ? markdown : "",
      stats: {
        pages: doc.inputData?.pageCount ?? 0,
        words: wordCount,
        textNative: doc.inputData?.pdfType === "text",
        lowConfidenceWords,
      },
    };
  } finally {
    await doc.terminate();
  }
}

// OCRs a PDF and returns an editable Word (.docx) file with scribe's recognized text, layout, and
// detected font styles -- turning a scanned filing into a document that opens in Word/LibreOffice.
async function convertPdfToDocx(file, options = {}) {
  const onProgress = options.onProgress;
  const doc = await runRecognition(file, onProgress);
  try {
    onProgress?.("Building the Word document...");
    return await doc.exportData("docx");
  } finally {
    await doc.terminate();
  }
}

window.__openclerkScribe = { extractPdfText, exportSearchablePdf, importPdfData, convertPdfToDocx };
