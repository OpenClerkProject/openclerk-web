import * as pdfjsLib from "pdfjs-dist";
import type { createWorker as TesseractCreateWorker } from "tesseract.js";

// pdf.js needs a worker script; pdf.worker.min.mjs is copied alongside the bundle at build time
// (see scripts/build.js) so this works without a bundler-specific worker-loading integration.
pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.mjs";

export type PageTextSource = "embedded" | "ocr" | "empty";

export interface PageExtraction {
  pageNumber: number;
  text: string;
  source: PageTextSource;
}

export interface ExtractPdfTextOptions {
  /** Run OCR on pages with no usable embedded text layer. Defaults to true. */
  ocr?: boolean;
  onProgress?: (message: string) => void;
}

// Below this many non-whitespace characters, a page's embedded text layer is treated as absent
// (rather than as a real but short page of text) and, if OCR is enabled, rasterized and OCR'd
// instead. This has to be well above "a few stray characters" -- e-filed documents commonly have
// a CM/ECF header stamp burned in as real embedded text on every page even when the scanned page
// body underneath it has none, so a low threshold would misread a scanned page as already having
// usable text.
const MIN_EMBEDDED_TEXT_LENGTH = 200;

function normalizeExtractedText(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

type TesseractWorker = Awaited<ReturnType<typeof TesseractCreateWorker>>;

async function createOcrWorker(onProgress?: (message: string) => void): Promise<TesseractWorker> {
  // Imported dynamically (rather than a top-level import) so the actual worker/WASM-core/
  // language-model fetches tesseract.js makes only happen once OCR genuinely runs, not on every
  // page load -- this page's esbuild config bundles tesseract.js's own JS into pdf-bundle.js
  // either way (no code-splitting for a plain IIFE bundle), but constructing a worker is what
  // actually triggers its network fetches, and a document with an embedded text layer on every
  // page should never trigger them at all.
  //
  // Deliberately left on tesseract.js's default CDN-hosted worker/core/language-model files
  // rather than vendoring them: the binary WASM core and per-language trained-data files are
  // several MB each, and unlike the rest of this project's "nothing ever leaves the browser"
  // pages, this specific page already has to fetch something to do OCR at all. The PDF's own
  // content is still never uploaded anywhere -- only a generic, page-content-independent language
  // model is fetched, once, and cached by the browser after that.
  const { createWorker } = await import("tesseract.js");
  return createWorker("eng", 1, {
    logger: (message) => {
      if (message.status === "recognizing text") {
        onProgress?.(`Running OCR... ${Math.round(message.progress * 100)}%`);
      }
    },
  });
}

async function ocrPage(page: pdfjsLib.PDFPageProxy, worker: TesseractWorker): Promise<string> {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d")!;
  await page.render({ canvasContext: context, viewport }).promise;

  const {
    data: { text },
  } = await worker.recognize(canvas);
  return text;
}

/**
 * Extracts text from every page of a PDF: first via pdf.js's embedded text layer (fast, exact --
 * works for virtually any e-filed document, since those are generated from a text source rather
 * than scanned), falling back to tesseract.js OCR for any page whose text layer is empty or
 * near-empty (a scanned/image-only page).
 */
export async function extractPdfText(file: File, options: ExtractPdfTextOptions = {}): Promise<PageExtraction[]> {
  const ocrEnabled = options.ocr !== false;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages: PageExtraction[] = [];

  let ocrWorker: TesseractWorker | null = null;
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      options.onProgress?.(`Reading page ${pageNumber} of ${doc.numPages}...`);
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const embeddedText = normalizeExtractedText(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));

      if (embeddedText.replace(/\s/g, "").length >= MIN_EMBEDDED_TEXT_LENGTH) {
        pages.push({ pageNumber, text: embeddedText, source: "embedded" });
        continue;
      }

      if (!ocrEnabled) {
        pages.push({ pageNumber, text: embeddedText, source: embeddedText ? "embedded" : "empty" });
        continue;
      }

      options.onProgress?.(`Page ${pageNumber}: no embedded text layer, running OCR (this can take a while)...`);
      ocrWorker ??= await createOcrWorker(options.onProgress);
      const ocrText = normalizeExtractedText(await ocrPage(page, ocrWorker));
      pages.push({ pageNumber, text: ocrText, source: "ocr" });
    }
  } finally {
    await ocrWorker?.terminate();
  }

  return pages;
}
