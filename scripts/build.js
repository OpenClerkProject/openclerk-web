const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist");
const watch = process.argv.includes("--watch");

// Independent bundles, not one shared one: the citation-checker page (main.ts) is meant to stay
// small and load fast, the document editor (editor/main.ts) pulls in the full
// hyperlinking/provider/hallucination-check machinery, and the PDF/OCR page (pdf/main.ts) pulls
// in pdf.js and tesseract.js -- together several MB. Bundling any of these together would mean
// every visitor to the other pages downloads code they never use.
//
// studio.html is the odd one out: it's a different HTML shell around the *same*
// editor-bundle.js (it loads that bundle directly, via a second <script> tag -- see studio.html)
// plus this small studio/chrome.ts bundle layered on top for the extra chrome (outline, comment
// gutter, slide-over), not a fork of editor/main.ts. studio-bundle.js itself stays tiny as a
// result -- all the citation/hyperlink/file-format logic is still only compiled once, into
// editor-bundle.js.
const PAGES = [
  { entry: "src/main.ts", outfile: "bundle.js", html: "src/index.html" },
  { entry: "src/editor/main.ts", outfile: "editor-bundle.js", html: "src/editor.html" },
  { entry: "src/pdf/main.ts", outfile: "pdf-bundle.js", html: "src/pdf.html" },
  { entry: "src/studio/chrome.ts", outfile: "studio-bundle.js", html: "src/studio.html" },
  { entry: "src/examples/main.ts", outfile: "examples-bundle.js", html: "src/examples.html" },
];

// Built but not referenced by any <script> tag at page-load time -- editor/main.ts injects a
// <script src="editor-pdf-bundle.js"> at runtime only when someone selects a .pdf file in the
// Document Editor (see loadPdfExtractor), so the same pdf.js/tesseract.js weight PAGES keeps out
// of index.html/editor.html's normal load doesn't get pulled back in just because the editor
// gained PDF support.
const LAZY_BUNDLES = [{ entry: "src/editor/pdfBridge.ts", outfile: "editor-pdf-bundle.js" }];

// pdf.js needs its worker script available as a plain file next to the bundle -- it isn't part
// of the bundle itself, since pdf.js loads it via `new Worker(workerSrc)`, not an ES import.
//
// The example PDF is served from the same source file tests/pdf.test.ts already uses as a
// fixture (a real, publicly filed scanned document -- see examples.html and the README's PDF &
// OCR Tools section), rather than keeping a second copy under src/ -- one canonical file for
// both purposes.
const STATIC_ASSETS = [
  { from: "node_modules/pdfjs-dist/build/pdf.worker.min.mjs", to: "pdf.worker.min.mjs" },
  { from: "tests/fixtures/mata-v-avianca-filing.pdf", to: "mata-v-avianca-filing.pdf" },
  // OpenClerk Studio's scribe.js glue -- hand-authored native ESM, copied verbatim (never
  // bundled: scribe can't go through esbuild; see src/studio/scribe-loader.mjs's header).
  { from: "src/studio/scribe-loader.mjs", to: "scribe-loader.mjs" },
];

// scribe.js-ocr powers OCR / searchable-PDF / font-style detection on the OpenClerk Studio page
// ONLY (the PDF & OCR Tools page and the plain Document Editor keep tesseract.js). scribe cannot
// be bundled by esbuild and forbids CDN loading, so its browser subtree is self-hosted under
// dist/scribe/ and loaded as native ESM by scribe-loader.mjs. Only the browser-relevant entries
// are vendored (its docs/examples/cli/mcp/UI dirs are skipped). These are build-copied into dist/,
// never committed -- same as the pdf worker above. Heavy (~60 MB) but isolated to Studio, and
// loaded lazily (only when a PDF operation is actually run there) and cached by the browser.
const SCRIBE_SRC = path.join(ROOT, "node_modules/scribe.js-ocr");
const SCRIBE_OUT = path.join(OUT_DIR, "scribe");
const SCRIBE_VENDOR_ENTRIES = ["scribe.js", "js", "lib", "tess", "fonts"];
// Tesseract language data, self-hosted same-origin rather than fetched from scribe's default
// jsdelivr CDN -- keeps OCR fully within the browser (nothing fetched from a third party), and is
// what scribe-loader.mjs points opt.langPath at. Sourced from the @tesseract.js-data/eng package
// (a devDependency), the exact same data scribe's CDN default would otherwise serve.
const SCRIBE_LANG_FROM = path.join(
  ROOT,
  "node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz",
);
const SCRIBE_LANG_OUT = path.join(OUT_DIR, "scribe-lang", "eng.traineddata.gz");

// Read directly from the installed package rather than this project's own package.json, so the
// UI reflects whatever openclerk-core build actually got bundled (its git ref is a tag, not an
// exact pin -- see README's stale-lockfile note) rather than just the declared dependency range.
const openclerkCoreVersion = require(
  path.join(ROOT, "node_modules/openclerk-core/package.json"),
).version;

async function build() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const buildOptions = [...PAGES, ...LAZY_BUNDLES].map(({ entry, outfile }) => ({
    entryPoints: [path.join(ROOT, entry)],
    bundle: true,
    outfile: path.join(OUT_DIR, outfile),
    format: "iife",
    target: "es2019",
    platform: "browser",
    logLevel: "info",
    define: { __OPENCLERK_CORE_VERSION__: JSON.stringify(openclerkCoreVersion) },
  }));

  if (watch) {
    const contexts = await Promise.all(buildOptions.map((options) => esbuild.context(options)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log("Watching for changes...");
  } else {
    await Promise.all(buildOptions.map((options) => esbuild.build(options)));
  }

  PAGES.forEach(({ html }) => {
    fs.copyFileSync(path.join(ROOT, html), path.join(OUT_DIR, path.basename(html)));
  });
  fs.copyFileSync(path.join(ROOT, "src/theme.css"), path.join(OUT_DIR, "theme.css"));

  STATIC_ASSETS.forEach(({ from, to }) => {
    fs.copyFileSync(path.join(ROOT, from), path.join(OUT_DIR, to));
  });

  vendorScribe();
}

// Copies scribe's self-hosted browser subtree + language data into dist/. Skipped when already
// present (the ~60 MB copy is the slowest part of a build, and node_modules doesn't change between
// rebuilds) unless OPENCLERK_REVENDOR_SCRIBE is set to force a refresh.
function vendorScribe() {
  const alreadyVendored =
    fs.existsSync(path.join(SCRIBE_OUT, "scribe.js")) && fs.existsSync(SCRIBE_LANG_OUT);
  if (alreadyVendored && !process.env.OPENCLERK_REVENDOR_SCRIBE) {
    return;
  }
  fs.mkdirSync(SCRIBE_OUT, { recursive: true });
  SCRIBE_VENDOR_ENTRIES.forEach((entry) => {
    fs.cpSync(path.join(SCRIBE_SRC, entry), path.join(SCRIBE_OUT, entry), { recursive: true });
  });
  fs.mkdirSync(path.dirname(SCRIBE_LANG_OUT), { recursive: true });
  fs.copyFileSync(SCRIBE_LANG_FROM, SCRIBE_LANG_OUT);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
