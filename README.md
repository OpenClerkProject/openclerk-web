# openclerk-web

A standalone, client-side-only Bluebook citation checker. Paste one or more case citations (or
upload a `.txt`/`.docx`/`.odt` file), pick an edition, and get formatting issues back — no server,
no account, no install for end users. Built on
[openclerk-core](https://github.com/OpenClerkProject/openclerk-core), the same citation-parsing
and Bluebook rule-checking logic shared with
[OpenClerk's Word add-in](https://github.com/OpenClerkProject/openclerk-word) and
[Google Docs add-on](https://github.com/OpenClerkProject/openclerk-gdocs).

Uploaded files never leave the browser — `.txt` is read directly, `.docx` is unzipped and its body
text extracted client-side (`src/docxText.ts`, the same OOXML-parsing approach `openclerk-word`
uses for its own `.docx` handling), and `.odt` likewise (`src/odtText.ts`, reading its
`content.xml` instead). Both formats share the same zip-loading defenses (size caps, entry-count
caps, decompressed-size caps) via `src/zipText.ts`. All three reuse the same
`extractCaseCitations`/`checkCitation` pipeline as pasted text. Have a PDF instead? See
**PDF & OCR Tools** below — it's a separate page so the main checker stays small and fast.

## Scope

The Citation Checker page (`index.html`) only does Bluebook Check — there's no document to scan,
so there's nothing to hyperlink or navigate to, and no Online Lookup (that needs a lookup
provider's API and credentials, which doesn't fit a "paste text, get an answer, nothing leaves
your browser" tool). Its own file upload supports `.txt`, `.docx`, and `.odt` only — no PDF,
deliberately: see the PDF & OCR Tools page below for why PDF support lives there instead of here.

## Document Editor (`editor.html`)

A separate page for drafting or pasting a whole document and running the full set of citation
workflows against it — Manage Hyperlinks (online lookup + parenthetical citations), Bluebook
Check, Find Hallucinations, and Embed Cited Text — the same file-upload formats as the Citation
Checker (`.txt`/`.docx`/`.odt`), plus two ways to get the edited document back out: **Download as
.txt** (plain text) and **Download as .odt** (a minimal but valid OpenDocument Text file — see
below for what's preserved — built client-side with `src/editor/exportDocument.ts`, no server
round-trip).

A formatting toolbar (`src/editor/formatting.ts`) adds **bold, italic, underline, paragraph
styles (Normal/Heading 1-3), bulleted and numbered lists, and undo/redo** to the document surface
— built on `document.execCommand`, which the HTML spec marks obsolete but which is still what
every evergreen browser implements for "toggle formatting on the current contenteditable
selection"; there's no standardized replacement, and hand-rolling a selection-aware bold/italic
toggle is exactly the problem real editor frameworks like ProseMirror/Tiptap exist to solve. The
`.odt` export preserves all of this — headings become real ODF headings (`<text:h>`), lists become `<text:list>` (numbered
lists get their own `text:list-style` so they render as "1. 2. 3." rather than falling back to a
reader's default bullet), and bold/italic/underline become `<text:span>`s referencing named
automatic styles. Applied hyperlinks and embedded citation excerpts (flattened to bracketed inline
text, since a true ODF `office:annotation` needs more metadata than the accuracy gain is worth)
are preserved the same as before. The plain-`.txt` export, naturally, can't represent any of this
formatting — it's just the document's text.

**Why not adopt a full editor framework (ProseMirror/Tiptap/Quill) instead:** it was considered,
and would give a strictly richer editing experience (tables, images, a real toolbar-state model)
at the cost of a large rewrite -- those frameworks own their own document model instead of letting
you freely mutate the DOM, so the citation-highlighting/hyperlinking logic this page already has
(`src/editor/dom.ts`'s Range-based find/wrap/unwrap) would need to be rebuilt against whichever
framework's marks/decorations API instead. For now this project is staying with the lighter-weight
`contenteditable` approach and adding features incrementally.

It also accepts `.pdf` as a fifth upload format, reusing PDF & OCR Tools' own extraction
(`src/pdf/pdfText.ts`'s `extractPdfText` — embedded text layer, falling back to OCR per page) to
populate the document with the scanned text, same as any other format. Unlike the other formats,
though, this doesn't pull pdf.js/tesseract.js into `editor-bundle.js`: selecting a `.pdf` file
lazily injects a separate `editor-pdf-bundle.js` `<script>` tag (built from
`src/editor/pdfBridge.ts`) the first time it's needed, and every subsequent PDF in the same
session reuses it. Everyone who never touches a PDF here pays nothing for this — the same
reasoning that keeps PDF/OCR out of the Citation Checker (see below) applies to the editor's own
default download, just solved by lazy-loading instead of leaving the feature out.

## OpenClerk Studio (`studio.html`)

A second, richer shell around the same Document Editor, for anyone who wants more editing
chrome around the same underlying tools — a desktop-app-style layout instead of the Document
Editor's single-column page.

![OpenClerk Studio: app bar, formatting toolbar, document outline, the document itself, a
comment gutter showing a flagged citation, an open Bluebook Check slide-over, and a status
bar](docs/screenshots/studio.png)

Studio adds, on top of everything the Document Editor already does:

- **A document outline** (left sidebar), generated live from the document's own headings —
  click any entry to scroll to it.
- **A "Citation Health" summary and comment gutter** — after running Bluebook Check and/or Find
  Hallucinations, flagged citations surface as cards next to the document (not just inside the
  workflow panel), each one click-to-jump. Read directly off the same rendered results the
  workflow panels already produce — see `src/studio/chrome.ts`'s file header for why.
- **A Citations menu + slide-over** instead of a persistent side panel, so the document gets the
  full window width when you're not actively running a workflow.
- **Left/justify paragraph alignment**, added to `src/editor/formatting.ts` (and so available on
  the plain Document Editor too — see its toolbar).
- **A status bar**: live word count, the selected Bluebook edition, and the same citation-health
  counts as the outline.

**What it deliberately doesn't add:** a manual "insert hyperlink" or "highlight" button. This
app's hyperlinking model is citation-verification-driven (Manage Hyperlinks looks a citation up
against a real provider before linking it) — a raw manual-link button would compete with, not
complement, that flow. The app bar's title, and its File/Edit/View/Insert menu bar, mirror a
familiar desktop-editor layout, but only File and Citations are backed by real functionality
(load/clear/download, and the four citation workflows); Edit/View/Insert have no corresponding
feature in this app yet and are left as plain labels rather than dead dropdowns that look
clickable but do nothing.

**How it's built — reusing the Document Editor's logic unmodified, not forking it:**
`studio.html` loads the *exact same* `editor-bundle.js` as `editor.html` (same `<script>` tag,
same compiled `src/editor/main.ts`), laid out inside different HTML — every element
`editor/main.ts` looks up by ID (`#document-surface`, `#workflow-select`,
`#bluebook-issue-list`, and so on) still exists in `studio.html`, just positioned inside the app
bar/outline/slide-over chrome instead of a static sidebar. A second, much smaller bundle
(`studio-bundle.js`, ~10KB, built from `src/studio/chrome.ts`) layers the outline, comment
gutter, menus, and status bar on top — it drives `editor-bundle.js`'s logic the same way a user
would (setting `#workflow-select`'s value and dispatching a real `change` event, never calling
into `main.ts` internals) and *observes* DOM output `editor-bundle.js` already produces (the
rendered rows in `#bluebook-issue-list`/`#hallucination-results-list`) rather than duplicating
any citation-checking logic. Net effect: `editor.html` and its bundle are completely unmodified
by Studio's existence (beyond the shared, additive alignment buttons above), and the two pages
can never drift out of feature parity with each other, because they're running the same code.

**Why keep the plain Document Editor at all, instead of just replacing it:** Studio's three/four-
pane layout (216px outline + flexible document + 344px slide-over) needs real width to work.
Below 860px it doesn't try to cram itself into a phone- or narrow-tablet-sized viewport — it
shows a plain notice pointing at the Document Editor instead:

![A narrow-viewport view of studio.html, showing a plain message: "Studio needs a larger
screen," explaining that the Document Editor works everywhere,
instead](docs/screenshots/studio-mobile-notice.png)

That's a deliberate choice over either (a) squeezing the same panels into a broken, half-usable
mobile layout, or (b) silently redirecting away from a page the user explicitly navigated to —
a clear, dismissable notice with a direct link felt more honest than either. The Document Editor
(below) has no such limit; its single-column layout already collapses cleanly on any screen size:

![The plain Document Editor: a single-column layout with a document pane and a workflow pane
side by side, showing the Manage Hyperlinks panel](docs/screenshots/editor.png)

## PDF & OCR Tools (`pdf.html`)

A separate page (own HTML file, own bundle) for uploading a PDF: it extracts text via
[pdf.js](https://mozilla.github.io/pdf.js/)'s embedded text layer, falling back to
[tesseract.js](https://github.com/naptha/tesseract.js) OCR for any page with no usable text layer
(a scanned/image-only page), then runs `openclerk-core`'s citation engine over the result --
full, short-form, `Id.`, and `supra` citations, clustered by case -- and optionally checks each
one against CourtListener to flag citations that don't resolve as possible hallucinations.

**Why a separate page, not a feature of the Citation Checker:** pdf.js and tesseract.js together
are several MB, and only someone who actually has a PDF needs them. Splitting this into its own
HTML file + bundle (`pdf-bundle.js`, built alongside `bundle.js`/`editor-bundle.js` by the same
`scripts/build.js`) means visitors to the other two pages never download that weight.

**Why this exists at all, when an earlier version of this README said PDF support was left out:**
that reasoning (pdf.js is heavy; OCR is unreliable for scanned PDFs) turned out to not hold up --
OCR via tesseract.js recovers scanned text just fine in practice, verified against a real,
publicly filed scanned document (see below), and "heavy" is solved by not shipping that weight to
every page, not by leaving the feature out.

**What never leaves the browser, and what does:** the PDF itself is parsed entirely client-side
and never uploaded anywhere. If OCR is needed for a page (no embedded text layer), tesseract.js
fetches its worker script, WASM core, and English language-model file from its default CDN host
the first time OCR runs in your browser -- that's a generic, page-content-independent file, not
anything from your document, and it's cached by the browser afterward. Checking citations against
CourtListener (opt-in, via the page's checkbox) sends only the matched citation strings, same as
the Citation Checker and Document Editor pages' own lookups -- never the document text.

**Tested against a real scanned filing:** [tests/fixtures/mata-v-avianca-filing.pdf](tests/fixtures/mata-v-avianca-filing.pdf)
is the affirmation in opposition from *Mata v. Avianca, Inc.*, No. 1:22-cv-01461-PKC (S.D.N.Y.) --
the filing at the center of the widely reported incident in which counsel submitted
ChatGPT-fabricated case citations to a federal court. Its pages have no embedded text layer at all
(only the CM/ECF header stamp does), so it's a genuine test of the OCR fallback, not just
text-layer extraction. `tests/pdf.test.ts` covers the citation-extraction and CourtListener-
verification wiring with `./pdfText`'s `extractPdfText` mocked (jsdom has no real `<canvas>`,
`Worker`, or WASM support to actually run pdf.js/tesseract.js). The underlying extraction
*algorithm* -- pdf.js text-layer extraction falling back to tesseract.js OCR -- was confirmed
end-to-end against this exact file via a separate Node CLI (pdfjs-dist's Node build +
@napi-rs/canvas), correctly recovering and flagging both fabricated citations (*Peterson v. Iran
Air*, *Martinez v. Delta Airlines, Inc.*). **This browser page's own code path has not yet been
manually smoke-tested in an actual browser** -- do that against the fixture above before relying
on it, since browser-specific concerns (the vendored worker file path, tesseract.js's CDN asset
fetch, real `<canvas>` rendering) differ from the Node CLI's.

## Architecture

- Plain static HTML + a single bundled JS file per page (`src/index.html` + `src/main.ts`,
  `src/editor.html` + `src/editor/main.ts`, `src/pdf.html` + `src/pdf/main.ts` → `dist/`) — no
  framework, no routing, nothing beyond what's needed to wire each page's DOM to
  `openclerk-core`. `src/studio.html` is the exception: it loads `editor-bundle.js` directly
  (not its own copy of `editor/main.ts`) plus its own small `studio-bundle.js`
  (`src/studio/chrome.ts`) for extra chrome — see the OpenClerk Studio section above.
- Unlike `openclerk-gdocs`, no shims are needed: a real browser already provides `fetch` and
  `URLSearchParams` natively, which is all `openclerk-core` needs.
- `scripts/build.js` uses esbuild to bundle each page's entry point independently (so, e.g., a
  Citation Checker visitor never downloads the Document Editor's or PDF & OCR Tools' code), and
  copies each page's HTML, the shared `src/theme.css` stylesheet, plus pdf.js's worker script
  alongside the bundles. That `dist/` folder is the entire deployable artifact — open
  `dist/index.html` directly in a browser, or serve the whole folder, no server-side logic
  required.
- One bundle, `editor-pdf-bundle.js`, is built but not linked from any HTML `<script>` tag --
  `editor/main.ts` injects it at runtime only when a `.pdf` is actually selected in the Document
  Editor. Plain IIFE bundles (this project's build format throughout) can't code-split a dynamic
  `import()` the way an ESM build with `splitting: true` could, so this is a deliberately
  low-tech stand-in: a real `<script>` tag, loaded once, that sets a `window` global the caller
  awaits.
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
git clone --branch v0.2.2 https://github.com/OpenClerkProject/openclerk-core.git /tmp/openclerk-core-build
cd /tmp/openclerk-core-build && npm install --ignore-scripts && npx tsc
```

then copy `package.json` + `lib/` into this repo's `node_modules/openclerk-core/`.

### If `npm test` fails with a `canvas` / `build/Release/canvas.node` error

`canvas` is an optional native dependency of `jsdom` (pulled in transitively via
`jest-environment-jsdom`) that some platforms — notably Windows on a newer Node.js version with no
published prebuilt binary, and no full Visual Studio C++ + Windows SDK toolchain to build one from
source — can't install a working copy of. `tests/globalSetup.js` detects this automatically (a
broken `canvas` otherwise crashes every suite, not just PDF-related ones, since none of this
project's tests actually exercise real canvas rendering) and moves the non-functional install aside
so jsdom falls back to its normal "canvas not installed" behavior. No action needed; a console
warning notes when this kicks in. Re-run `npm install` later to restore a working `canvas` once a
prebuilt binary or full build toolchain is available.

## License

MIT
