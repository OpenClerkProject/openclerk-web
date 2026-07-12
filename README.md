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
.txt** (plain text) and **Download as .odt** (a minimal but valid OpenDocument Text file —
paragraphs, applied hyperlinks, and embedded citation excerpts flattened to bracketed inline text
— built client-side with `src/editor/exportDocument.ts`, no server round-trip). Neither export
attempts to preserve rich formatting, since the editor's `contenteditable` surface doesn't have
any formatting controls to begin with.

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
  `openclerk-core`.
- Unlike `openclerk-gdocs`, no shims are needed: a real browser already provides `fetch` and
  `URLSearchParams` natively, which is all `openclerk-core` needs.
- `scripts/build.js` uses esbuild to bundle each page's entry point independently (so, e.g., a
  Citation Checker visitor never downloads the Document Editor's or PDF & OCR Tools' code), and
  copies each page's HTML plus pdf.js's worker script alongside the bundles. That `dist/` folder
  is the entire deployable artifact — open `dist/index.html` directly in a browser, or serve the
  whole folder, no server-side logic required.
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
git clone --branch v0.2.0 https://github.com/OpenClerkProject/openclerk-core.git /tmp/openclerk-core-build
cd /tmp/openclerk-core-build && npm install --ignore-scripts && npx tsc
```

then copy `package.json` + `lib/` into this repo's `node_modules/openclerk-core/`.

## License

MIT
