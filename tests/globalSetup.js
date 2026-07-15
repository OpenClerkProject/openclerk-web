// jest-environment-jsdom's own "is canvas installed" check (node_modules/jsdom/lib/jsdom/utils.js)
// only guards `require.resolve("canvas")`, not the `require("canvas")` right after it -- so a
// `canvas` whose native binding failed to build (present on disk, but not loadable; common on
// Windows/newer Node versions with no prebuilt binary published for that combo) crashes test
// environment setup for every suite, not just PDF-related ones, even though nothing in this
// project's tests exercises real canvas rendering (see tests/pdf.test.ts's own comment on why
// pdf.js/tesseract.js are mocked instead).
//
// jest-environment-jsdom loads through Jest's own infrastructure resolver, not the sandboxed
// per-test module registry, so `moduleNameMapper` can't redirect its `require("canvas")` call --
// the only lever that actually reaches jsdom's `require.resolve` check is Node's real module
// resolution. This runs once, before any worker spins up jsdom, and -- only if canvas is actually
// broken -- moves it out of the way so `require.resolve("canvas")` fails cleanly and jsdom falls
// back to its already-supported "canvas not installed" path, exactly as it does for the majority
// of jsdom/jest users who never install the optional `canvas` package at all.
const fs = require("fs");
const path = require("path");

module.exports = async function globalSetup() {
  const canvasDir = path.join(__dirname, "..", "node_modules", "canvas");
  if (!fs.existsSync(canvasDir)) {
    return;
  }

  let canvasLoads = true;
  try {
    require("canvas");
  } catch {
    canvasLoads = false;
  }
  if (canvasLoads) {
    return;
  }

  const disabledDir = path.join(__dirname, "..", "node_modules", ".canvas-broken-binding");
  fs.rmSync(disabledDir, { recursive: true, force: true });
  fs.renameSync(canvasDir, disabledDir);
  console.warn(
    "[tests/globalSetup] `canvas`'s native binding failed to load -- moved node_modules/canvas " +
      "aside for this test run so jsdom falls back to running without it (safe: no test here " +
      "relies on real canvas rendering). Re-run `npm install` to restore it once a working " +
      "prebuilt binary or full native build toolchain is available."
  );
};
