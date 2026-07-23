# Security Policy

OpenClerk Web is a client-side-only Bluebook citation checker. It is a static site — HTML, CSS, and
JavaScript served from GitHub Pages — with **no backend server of its own**. Everything runs in your
browser: pasting or uploading a document, parsing `.docx`/`.odt`/`.pdf` files, running OCR, checking
Bluebook formatting, and detecting fabricated ("hallucinated") citations all happen locally. The
only network requests are the citation lookups you explicitly run against a third-party case-law API
(CourtListener). Because it is used in legal work, we treat citation-verification accuracy and safe
hyperlink/HTML insertion as security properties, not just correctness concerns.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull
requests.** Public disclosure before a fix exists puts users at risk.

Instead, report privately through GitHub's private vulnerability reporting:

1. Open the [**Security** tab](https://github.com/OpenClerkProject/openclerk-web/security) of this
   repository.
2. Click **"Report a vulnerability"** to open an advisory visible only to the maintainers.

> **Maintainer note:** if the "Report a vulnerability" button isn't visible, enable it once under
> **Settings → Code security and analysis → Private vulnerability reporting**.

Please include enough detail to reproduce and assess the issue:

- the affected page and file (e.g. `src/editor/exportDocument.ts`) and the commit,
- steps to reproduce, or a proof of concept,
- the impact you believe it has (what data or action it exposes).

OpenClerk is maintained by an individual, in the open, on a **best-effort basis** — there is no paid
support line or guaranteed response time. You can expect an acknowledgment as soon as the maintainer
is able, followed by coordination on a fix and a disclosure timeline.

## Coordinated disclosure

Please give the maintainer a reasonable opportunity to release a fix before disclosing publicly.
Once a fix ships, the advisory can be published and credit given to the reporter (if wanted). There
is no bug-bounty program.

## Supported versions

OpenClerk Web is a static site with **no versioned releases and no install step** — the site running
at any time is whatever was last built and deployed from `main` (see
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)). There is nothing for a
user to update. Security fixes are made against `main`; please reproduce against the currently
deployed site (or the latest `main`) before reporting.

| Version | Supported |
| --- | --- |
| Currently deployed site (`main`) | ✅ |
| Older commits / local forks | ❌ (reproduce against `main`) |

## Scope

**In scope** — the web app in this repository: everything under `src/` (the four pages and their
shared modules), the build tooling under `scripts/`, and the GitHub Actions workflows under
`.github/workflows/`. The security-sensitive areas, specifically:

- **Citation verification / hallucination detection** — a check must never report a fabricated
  citation as "verified" (the project's core trust property). The lookup/verification workflows are
  wired in `src/editor/main.ts` and `src/pdf/main.ts`.
- **Hyperlink insertion and export** — URL-scheme validation at every sink where a link is written:
  `isSafeHyperlinkUrl` before a link is inserted into the document surface (`src/editor/main.ts`),
  and `isSafeExportHref` revalidation when serializing an `.odt` (`src/editor/exportDocument.ts`).
- **Local document parsing** — untrusted uploads are parsed entirely in the browser; the zip-bomb /
  oversized-content defenses live in `src/zipText.ts` (shared by `src/docxText.ts` and
  `src/odtText.ts`).
- **Local PDF/OCR** — the PDF is never uploaded; OCR (`src/pdf/pdfText.ts`) and Studio's scribe.js
  path (`src/studio/scribe-loader.mjs`) are fully self-hosted, so nothing leaves the browser.
- **Content-Security-Policy** — because the site is server-less, the CSP is delivered per page via a
  `<meta http-equiv="Content-Security-Policy">` tag in each HTML file; a change that would weaken one
  of those policies is in scope.
- **Credential handling** — a CourtListener API token entered in the UI is held in memory for the
  session only and sent over HTTPS to CourtListener alone; it is never persisted or sent elsewhere.

**Out of scope:**

- **Third-party services** OpenClerk can talk to (CourtListener) — report issues in how *they*
  handle data to that vendor directly.
- **[`openclerk-core`](https://github.com/OpenClerkProject/openclerk-core)** — the shared citation /
  Bluebook logic (parsing, `isSafeHyperlinkUrl`, the hallucination check itself) lives in a separate
  repository; report issues in that logic there.

## Existing security posture

The README's [Scope](README.md#scope) section and the per-page descriptions document what each page
does, what stays in the browser, and what (only citation lookups) is sent to CourtListener.
