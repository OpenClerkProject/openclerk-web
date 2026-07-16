# design-sync notes — openclerk-web

**This is not a component-library sync.** openclerk-web has no component framework
(no React/Vue/Svelte/Lit), no Storybook, and no reusable exported UI components — it's
three static HTML pages (`src/index.html`, `src/editor.html`, `src/pdf.html`) driven by
page-specific vanilla-TypeScript `main.ts` files, sharing one stylesheet
(`src/theme.css`).

Per the user's explicit choice (2026-07-16), this project was synced as a **style-only
reference** instead: `src/theme.css`'s design tokens (CSS custom properties) and the
shared class vocabulary, hand-packaged — not run through the `package-build.mjs` /
`resync.mjs` converter pipeline, since that pipeline expects components to build and
grade.

Consequences for future syncs:
- There is no `_ds_sync.json` anchor. A future run has nothing to diff against and
  should re-verify/re-upload everything, which is correct.
- If openclerk-web ever grows a real component layer (e.g. a shared web-components
  library extracted from the three pages), re-run `/design-sync` from scratch against
  that — this style-only package is not a base to incrementally build on.
- Source of truth for the styles is `src/theme.css` on `main`. If it changes
  meaningfully, re-copy it into `ds-bundle/styles.css` and re-derive the token JSON
  files, then re-upload.
