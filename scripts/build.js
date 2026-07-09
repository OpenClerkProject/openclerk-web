const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist");
const watch = process.argv.includes("--watch");

// Two independent bundles, not one shared one: the citation-checker page (main.ts) is meant to
// stay small and load fast, while the document editor (editor/main.ts) pulls in the full
// hyperlinking/provider/hallucination-check machinery and will only ever grow from here. Bundling
// them together would mean every citation-checker visitor downloads code they never use.
const PAGES = [
  { entry: "src/main.ts", outfile: "bundle.js", html: "src/index.html" },
  { entry: "src/editor/main.ts", outfile: "editor-bundle.js", html: "src/editor.html" },
];

async function build() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const buildOptions = PAGES.map(({ entry, outfile }) => ({
    entryPoints: [path.join(ROOT, entry)],
    bundle: true,
    outfile: path.join(OUT_DIR, outfile),
    format: "iife",
    target: "es2019",
    platform: "browser",
    logLevel: "info",
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
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
