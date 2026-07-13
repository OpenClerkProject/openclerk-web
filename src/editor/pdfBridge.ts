import { extractPdfText } from "../pdf/pdfText";

// Built as its own bundle (editor-pdf-bundle.js, see scripts/build.js) rather than imported
// directly by editor/main.ts: pdf.js + tesseract.js are several MB, and this codebase's whole
// multi-page architecture exists to keep that weight out of pages that don't need it (see
// README.md's "PDF & OCR Tools" section) -- including the Document Editor itself. Loading this
// script is deferred until someone actually selects a .pdf file there (see loadPdfExtractor in
// editor/main.ts), which injects a <script> tag pointing at this file rather than a static
// import, since plain IIFE bundles (this project's build format) can't code-split a dynamic
// import() the way an ESM build could.
declare global {
  interface Window {
    __openclerkExtractPdfText?: typeof extractPdfText;
  }
}

window.__openclerkExtractPdfText = extractPdfText;
