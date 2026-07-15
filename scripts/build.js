const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist");
const watch = process.argv.includes("--watch");

// Three independent bundles, not one shared one: the citation-checker page (main.ts) is meant to
// stay small and load fast, the document editor (editor/main.ts) pulls in the full
// hyperlinking/provider/hallucination-check machinery, and the PDF/OCR page (pdf/main.ts) pulls
// in pdf.js and tesseract.js -- together several MB. Bundling any of these together would mean
// every visitor to the other pages downloads code they never use.
const PAGES = [
  { entry: "src/main.ts", outfile: "bundle.js", html: "src/index.html" },
  { entry: "src/editor/main.ts", outfile: "editor-bundle.js", html: "src/editor.html" },
  { entry: "src/pdf/main.ts", outfile: "pdf-bundle.js", html: "src/pdf.html" },
];

// Built but not referenced by any <script> tag at page-load time -- editor/main.ts injects a
// <script src="editor-pdf-bundle.js"> at runtime only when someone selects a .pdf file in the
// Document Editor (see loadPdfExtractor), so the same pdf.js/tesseract.js weight PAGES keeps out
// of index.html/editor.html's normal load doesn't get pulled back in just because the editor
// gained PDF support.
const LAZY_BUNDLES = [{ entry: "src/editor/pdfBridge.ts", outfile: "editor-pdf-bundle.js" }];

// pdf.js needs its worker script available as a plain file next to the bundle -- it isn't part
// of the bundle itself, since pdf.js loads it via `new Worker(workerSrc)`, not an ES import.
const STATIC_ASSETS = [
  { from: "node_modules/pdfjs-dist/build/pdf.worker.min.mjs", to: "pdf.worker.min.mjs" },
];

// Read directly from the installed package rather than this project's own package.json, so the
// UI reflects whatever openclerk-core build actually got bundled (its git ref is a tag, not an
// exact pin -- see README's stale-lockfile note) rather than just the declared dependency range.
const openclerkCoreVersion = require(path.join(ROOT, "node_modules/openclerk-core/package.json")).version;

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
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
