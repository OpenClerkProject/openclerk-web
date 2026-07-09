# openclerk-web

A standalone, client-side-only Bluebook citation checker. Paste one or more case citations (or
upload a `.txt`/`.docx` file), pick an edition, and get formatting issues back — no server, no
account, no install for end users. Built on
[openclerk-core](https://github.com/OpenClerkProject/openclerk-core), the same citation-parsing
and Bluebook rule-checking logic shared with
[OpenClerk's Word add-in](https://github.com/OpenClerkProject/openclerk-word) and
[Google Docs add-on](https://github.com/OpenClerkProject/openclerk-gdocs).

Uploaded files never leave the browser — `.txt` is read directly, and `.docx` is unzipped and its
body text extracted client-side (`src/docxText.ts`, the same OOXML-parsing approach
`openclerk-word` uses for its own `.docx` handling), reusing the same `extractCaseCitations` /
`checkCitation` pipeline as pasted text.

## Scope

Only Bluebook Check is implemented here — there's no document to scan, so there's nothing to
hyperlink or navigate to, and no Online Lookup (that needs a lookup provider's API and
credentials, which doesn't fit a "paste text, get an answer, nothing leaves your browser" tool).

File upload supports `.txt` and `.docx` only — no PDF. PDF text extraction needs a much heavier
client-side dependency (`pdf.js`, ~1MB+ with a web worker) and is unreliable for scanned/image
PDFs in the first place, so it was deliberately left out rather than half-implemented.

## Architecture

- Plain static HTML + a single bundled JS file (`src/index.html` + `src/main.ts` → `dist/`) — no
  framework, no routing, nothing beyond what's needed to wire a textarea and a button to
  `openclerk-core`'s `extractCaseCitations` / `parseCaseCitation` / `bluebookRuleSetRegistry`.
- Unlike `openclerk-gdocs`, no shims are needed: a real browser already provides `fetch` and
  `URLSearchParams` natively, which is all `openclerk-core` needs (and this tool doesn't even use
  `fetch`, since Bluebook checking makes no network calls at all).
- `scripts/build.js` uses esbuild to bundle `src/main.ts` (which pulls in `openclerk-core`) into
  `dist/bundle.js`, and copies `src/index.html` alongside it. That `dist/` folder is the entire
  deployable artifact — open `dist/index.html` directly in a browser, no server required.
- Deployed to GitHub Pages via `.github/workflows/deploy-pages.yml` on every push to `main`.

## Development

```bash
npm install
npm test          # jest + jsdom — exercises the actual DOM wiring, not just openclerk-core's own logic
npm run lint       # tsc --noEmit
npm run build      # bundles src/ -> dist/
```

Then open `dist/index.html` directly in a browser, or serve it locally (e.g. `npx serve dist`).

### If `npm install` fails on `openclerk-core`

`openclerk-core` is consumed as a git dependency (not on the npm registry yet), which means npm
needs to run its `prepare` script (`tsc`) to produce importable output. Newer npm versions gate
lifecycle scripts behind explicit allowlisting by default (`EALLOWSCRIPTS`) — if you hit that,
either allowlist it deliberately (`npm config set allow-scripts openclerk-core` or the
`allowScripts` field in `package.json`) after confirming what the script does, or build it
manually and drop the output into `node_modules/openclerk-core` yourself:

```bash
git clone --branch v0.1.0 https://github.com/OpenClerkProject/openclerk-core.git /tmp/openclerk-core-build
cd /tmp/openclerk-core-build && npm install --ignore-scripts && npx tsc
```

then copy `package.json` + `lib/` into this repo's `node_modules/openclerk-core/`.

## License

MIT
