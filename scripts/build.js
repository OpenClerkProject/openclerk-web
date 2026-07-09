const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist");
const watch = process.argv.includes("--watch");

async function build() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const options = {
    entryPoints: [path.join(ROOT, "src/main.ts")],
    bundle: true,
    outfile: path.join(OUT_DIR, "bundle.js"),
    format: "iife",
    target: "es2019",
    platform: "browser",
    logLevel: "info",
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(options);
  }

  fs.copyFileSync(path.join(ROOT, "src/index.html"), path.join(OUT_DIR, "index.html"));
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
