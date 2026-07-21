// OpenClerk Studio's "chrome" -- the app bar, outline, comment gutter, workflow slide-over, and
// status bar around the Document Editor's actual logic.
//
// This file deliberately knows nothing about citation-checking or file formats -- all of that
// still lives in editor/main.ts, loaded on this page unmodified as editor-bundle.js
// (studio.html reuses the exact same element IDs main.ts already wires up: #document-surface,
// #workflow-select, #bluebook-issue-list, and so on, just laid out differently). Everything here
// either (a) drives those existing elements the same way a user's mouse would -- setting
// #workflow-select's value and dispatching a real "change" event rather than calling into
// main.ts's internals -- or (b) *observes* DOM output main.ts already produces (the rendered
// rows in #bluebook-issue-list / #hallucination-results-list) to build the outline's "Citation
// Health" summary and the comment gutter. That keeps this file (and studio-bundle.js) completely
// decoupled from editor/main.ts's internals, so editor.html and its bundle are unaffected by
// anything here.
//
// The one exception is the Insert menu's "Hyperlink..." command, which reuses dom.ts's
// `wrapRange` (a small, dependency-free DOM primitive, not part of main.ts's citation logic) for
// the actual DOM wrapping.

import { wrapRange } from "../editor/dom";
import { MANUAL_HYPERLINK_CLASS } from "../editor/markers";

// Deliberately NOT importing openclerk-core's own isSafeHyperlinkUrl here: openclerk-core's
// compiled output is one CommonJS barrel file (lib/index.js), which esbuild can't tree-shake --
// importing even this one small function pulled in the *entire* library (bluebook rule sets,
// citation providers, everything editor-bundle.js already has), ballooning this file's ~10KB
// bundle to ~475KB. Same reasoning as editor/main.ts's hand-written PdfPageExtraction type: a
// small, self-contained duplicate here is cheaper than an import that isn't actually small. Keep
// this in sync with openclerk-core's src/utils.ts if its allowed schemes ever change.
const ALLOWED_HYPERLINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);
function isSafeHyperlinkUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = new URL(trimmed, "https://placeholder.invalid/");
    return ALLOWED_HYPERLINK_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}

type WorkflowPanel = "manage-hyperlinks" | "bluebook-check" | "hallucination-check" | "embed-cited-text";

const PANEL_TITLES: Record<WorkflowPanel, string> = {
  "manage-hyperlinks": "Manage Hyperlinks",
  "bluebook-check": "Bluebook Check",
  "hallucination-check": "Find Hallucinations",
  "embed-cited-text": "Embed Cited Text",
};

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// ---- Dropdown menus (File / Citations / Download) ----

function closeAllDropdowns(): void {
  document.querySelectorAll<HTMLElement>(".stu-dropdown.open").forEach((el) => el.classList.remove("open"));
  document.querySelectorAll<HTMLElement>(".stu-menu-trigger.open").forEach((el) => {
    el.classList.remove("open");
    el.setAttribute("aria-expanded", "false");
  });
}

function wireDropdown(triggerId: string, menuId: string): void {
  const trigger = $(triggerId);
  const menu = $(menuId);
  if (!trigger || !menu) {
    return;
  }
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = !menu.classList.contains("open");
    closeAllDropdowns();
    if (willOpen) {
      menu.classList.add("open");
      trigger.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
    }
  });
  menu.addEventListener("click", (event) => {
    // Let clicks on real controls (the file <label>/<input>, download/clear buttons) do their
    // job; just close the menu afterward instead of before, so a screen reader announcement
    // isn't cut off mid-click.
    window.setTimeout(closeAllDropdowns, 0);
    event.stopPropagation();
  });
}

// ---- Workflow slide-over, driven through #workflow-select (main.ts already listens for its
// "change" event and toggles the matching .tab-panel -- this never touches main.ts directly) ----

function openWorkflow(panel: WorkflowPanel): void {
  const select = $("workflow-select") as HTMLSelectElement | null;
  const slideover = $("stu-slideover");
  const title = $("stu-slideover-title");
  if (!select || !slideover) {
    return;
  }
  select.value = panel;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  if (title) {
    title.textContent = PANEL_TITLES[panel];
  }
  slideover.classList.add("open");
}

function closeWorkflow(): void {
  $("stu-slideover")?.classList.remove("open");
}

function wireCitationsMenu(): void {
  document.querySelectorAll<HTMLElement>("#stu-cite-menu [data-panel]").forEach((button) => {
    button.addEventListener("click", () => openWorkflow(button.dataset.panel as WorkflowPanel));
  });
  $("stu-slideover-close")?.addEventListener("click", closeWorkflow);
}

// ---- Outline (generated from the document's own h1/h2/h3 headings) ----

function refreshOutline(): void {
  const doc = $("document-surface");
  const list = $("stu-outline-list");
  const desk = $("stu-desk");
  if (!doc || !list) {
    return;
  }

  const headings = Array.from(doc.querySelectorAll<HTMLElement>("h1, h2, h3"));
  list.innerHTML = "";

  if (headings.length === 0) {
    const empty = document.createElement("p");
    empty.className = "stu-outline-empty";
    empty.textContent = "No headings yet -- use the paragraph-style menu to add one.";
    list.appendChild(empty);
    return;
  }

  headings.forEach((heading, index) => {
    heading.id = heading.id || `stu-heading-${index}`;
    const item = document.createElement("button");
    item.type = "button";
    item.className = `stu-outline-item stu-outline-${heading.tagName.toLowerCase()}`;
    item.textContent = heading.textContent?.trim() || "(untitled)";
    item.addEventListener("click", () => {
      if (!desk) {
        return;
      }
      const delta = heading.getBoundingClientRect().top - desk.getBoundingClientRect().top;
      desk.scrollTo({ top: desk.scrollTop + delta - 40, behavior: "smooth" });
    });
    list.appendChild(item);
  });
}

// ---- Word count ----

function refreshWordCount(): void {
  const doc = $("document-surface");
  const wordCountEl = $("stu-wordcount");
  if (!doc || !wordCountEl) {
    return;
  }
  // jsdom (this project's test environment) doesn't implement `innerText` at all -- same gap
  // documented elsewhere in this codebase (execCommand, scrollIntoView) -- so fall back to
  // `textContent`, which is close enough for a word count (it just also counts text a real
  // browser would hide via CSS, which this app's document surface never does).
  const text = doc.innerText ?? doc.textContent ?? "";
  const count = (text.trim().match(/\S+/g) || []).length;
  wordCountEl.textContent = `${count.toLocaleString()} word${count === 1 ? "" : "s"}`;
}

// ---- Bluebook edition label (mirrors the selected edition into the status bar) ----

function refreshEditionLabel(): void {
  const select = $("bluebook-edition-select") as HTMLSelectElement | null;
  const label = $("stu-edition-label");
  if (!select || !label) {
    return;
  }
  const selected = select.options[select.selectedIndex];
  label.textContent = selected ? selected.textContent : "";
}

// ---- Citation Health summary + comment gutter ----
// Both are read directly off the rows editor/main.ts already rendered into #bluebook-issue-list
// and #hallucination-results-list -- see the file header for why this reads rendered output
// instead of importing main.ts's internal result arrays.

interface ResultRow {
  citationButton: HTMLButtonElement;
  status: "ok" | "warning" | "error";
  message: string;
}

function readResultRows(containerId: string): ResultRow[] {
  const container = $(containerId);
  if (!container) {
    return [];
  }
  return Array.from(container.querySelectorAll<HTMLElement>(".bluebook-issue-row"))
    .map((row): ResultRow | null => {
      const citationButton = row.querySelector<HTMLButtonElement>(".citation-link");
      if (!citationButton) {
        return null;
      }
      const status = row.classList.contains("status-error")
        ? "error"
        : row.classList.contains("status-warning")
          ? "warning"
          : "ok";
      const messageEl = row.querySelector<HTMLElement>(".helper-text, .bluebook-issue-item-list li");
      return { citationButton, status, message: messageEl?.textContent?.trim() || "" };
    })
    .filter((row): row is ResultRow => row !== null);
}

function refreshHealthAndGutter(): void {
  const bluebookRows = readResultRows("bluebook-issue-list");
  const hallucinationRows = readResultRows("hallucination-results-list");

  // "Verified" and "possible hallucination" map to the Find Hallucinations workflow (that's
  // literally its job); "formatting issue" maps to Bluebook Check warnings/errors. The two
  // workflows aren't a unified data model underneath, so this is a readable approximation, not a
  // strict count of distinct citations -- a citation checked by both workflows can contribute to
  // both figures.
  const verifiedCount = hallucinationRows.filter((row) => row.status === "ok").length;
  const formattingIssueCount = bluebookRows.filter((row) => row.status !== "ok").length;
  const possibleHallucinationCount = hallucinationRows.filter((row) => row.status === "error").length;

  renderHealthSummary(verifiedCount, formattingIssueCount, possibleHallucinationCount);
  renderStatusBarCounts(verifiedCount, formattingIssueCount, possibleHallucinationCount);
  renderGutter(bluebookRows, hallucinationRows);
}

function renderHealthSummary(verified: number, formattingIssues: number, hallucinations: number): void {
  const container = $("stu-health-summary");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  const rows: { count: number; label: string; kind: "ok" | "warning" | "error" }[] = [
    { count: verified, label: `${verified} verified`, kind: "ok" },
    { count: formattingIssues, label: `${formattingIssues} formatting issue${formattingIssues === 1 ? "" : "s"}`, kind: "warning" },
    { count: hallucinations, label: `${hallucinations} possible hallucination${hallucinations === 1 ? "" : "s"}`, kind: "error" },
  ];
  if (rows.every((row) => row.count === 0)) {
    const empty = document.createElement("p");
    empty.className = "stu-outline-empty";
    empty.textContent = "Run a check from the Citations menu to see results here.";
    container.appendChild(empty);
    return;
  }
  rows
    .filter((row) => row.count > 0)
    .forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "stu-health-row";
      const dot = document.createElement("span");
      dot.className = `stu-health-dot ${row.kind}`;
      const text = document.createElement("span");
      text.textContent = row.label;
      rowEl.appendChild(dot);
      rowEl.appendChild(text);
      container.appendChild(rowEl);
    });
}

function renderStatusBarCounts(verified: number, formattingIssues: number, hallucinations: number): void {
  const verifiedEl = $("stu-status-verified");
  const warningEl = $("stu-status-warning");
  const errorEl = $("stu-status-error");
  if (verifiedEl) {
    verifiedEl.textContent = verified > 0 ? `● ${verified} verified` : "";
  }
  if (warningEl) {
    warningEl.textContent = formattingIssues > 0 ? `● ${formattingIssues} issue${formattingIssues === 1 ? "" : "s"}` : "";
  }
  if (errorEl) {
    errorEl.textContent = hallucinations > 0 ? `● ${hallucinations} flagged` : "";
  }
}

function renderGutter(bluebookRows: ResultRow[], hallucinationRows: ResultRow[]): void {
  const gutter = $("stu-gutter");
  if (!gutter) {
    return;
  }
  gutter.innerHTML = "";

  const flagged = [
    ...bluebookRows.filter((row) => row.status !== "ok").map((row) => ({ row, source: "Bluebook Check" })),
    ...hallucinationRows.filter((row) => row.status !== "ok").map((row) => ({ row, source: "Find Hallucinations" })),
  ];

  flagged.forEach(({ row, source }) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `stu-gutter-card status-${row.status}`;

    const head = document.createElement("div");
    head.className = "stu-gutter-card-head";
    const badge = document.createElement("span");
    badge.className = "stu-gutter-card-badge";
    badge.textContent = "§";
    const sourceEl = document.createElement("span");
    sourceEl.className = "stu-gutter-card-source";
    sourceEl.textContent = "OpenClerk";
    const kindEl = document.createElement("span");
    kindEl.className = "stu-gutter-card-kind";
    kindEl.textContent = source;
    head.appendChild(badge);
    head.appendChild(sourceEl);
    head.appendChild(kindEl);

    const cite = document.createElement("div");
    cite.className = "stu-gutter-card-cite";
    cite.textContent = row.citationButton.textContent || "";

    const message = document.createElement("div");
    message.className = "stu-gutter-card-message";
    message.textContent = row.message;

    card.appendChild(head);
    card.appendChild(cite);
    card.appendChild(message);
    card.addEventListener("click", () => row.citationButton.click());

    gutter.appendChild(card);
  });
}

// ---- Insert menu: generic hyperlink on the current selection ----
// Deliberately separate from Manage Hyperlinks (Citations menu), which looks a *case citation* up
// against a real provider before linking it -- this is a plain "link this text to a URL" command
// for everything else a legal document might reference (an exhibit, a filed docket entry, an
// external website), the same baseline feature every word processor's Insert menu has.

function setStudioStatus(message: string): void {
  const statusEl = $("status");
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function insertHyperlink(): void {
  const doc = $("document-surface");
  const selection = document.getSelection();
  if (!doc || !selection || selection.rangeCount === 0) {
    setStudioStatus("Select some text in the document first.");
    return;
  }

  const range = selection.getRangeAt(0);
  if (range.collapsed || !doc.contains(range.startContainer) || !doc.contains(range.endContainer)) {
    setStudioStatus("Select some text in the document first.");
    return;
  }

  const url = window.prompt("Link URL:");
  if (url === null) {
    return;
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return;
  }
  if (!isSafeHyperlinkUrl(trimmed)) {
    setStudioStatus('That URL doesn\'t look safe to link to -- only "http://" and "https://" links are allowed.');
    return;
  }

  const wrapped = wrapRange(range, () => {
    const a = document.createElement("a");
    a.className = MANUAL_HYPERLINK_CLASS;
    a.href = trimmed;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  });

  if (!wrapped) {
    setStudioStatus("Could not add a hyperlink to the current selection.");
    return;
  }

  // Collapse the selection to just after the new link, rather than leaving it spanning the
  // (now-wrapped) old range or clearing it entirely -- keeps the cursor in a normal, predictable
  // place so typing and arrow-key navigation continue naturally from where the link ends.
  const afterLink = document.createRange();
  afterLink.setStartAfter(wrapped);
  afterLink.collapse(true);
  selection.removeAllRanges();
  selection.addRange(afterLink);

  setStudioStatus("Hyperlink added.");
}

// ---- Scribe.js: Studio-only OCR + searchable-PDF export ----
// scribe.js is a higher-accuracy OCR engine than the tesseract.js the PDF & OCR Tools page and
// the plain Document Editor use. It also reports font styles and can emit a searchable PDF (an
// invisible OCR text layer over the original scan). It's used ONLY here in Studio, because it's
// heavy (~60 MB of self-hosted assets), can't be bundled by esbuild, and can't be CDN-loaded --
// see src/studio/scribe-loader.mjs. It loads lazily: the native-ESM loader is only injected the
// first time a PDF operation actually runs, so Studio sessions that never touch a PDF pay nothing.
//
// editor/main.ts already declares `window.__openclerkExtractPdfText` (its lazy PDF-import seam);
// setting it here to a scribe-backed wrapper is what makes the shared editor-bundle.js use scribe
// on this page, with no change to that bundle. Only `__openclerkScribe` (the loader's own export)
// is new to declare.
type StudioPdfPage = { pageNumber: number; text: string; source: "embedded" | "ocr" | "empty" };
interface ScribeApi {
  extractPdfText: (file: File, options?: { onProgress?: (message: string) => void }) => Promise<StudioPdfPage[]>;
  exportSearchablePdf: (file: File, options?: { onProgress?: (message: string) => void }) => Promise<ArrayBuffer>;
}
declare global {
  interface Window {
    __openclerkScribe?: ScribeApi;
  }
}

let scribeLoadPromise: Promise<ScribeApi> | null = null;

/** Injects the native-ESM scribe loader once and resolves with its window-exposed API. */
function ensureScribe(): Promise<ScribeApi> {
  if (window.__openclerkScribe) {
    return Promise.resolve(window.__openclerkScribe);
  }
  if (!scribeLoadPromise) {
    scribeLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "module";
      script.src = "scribe-loader.mjs";
      // The loader sets window.__openclerkScribe as its final statement; a module script's load
      // event fires after evaluation, so the global is present by the time this runs.
      script.onload = () => {
        if (window.__openclerkScribe) {
          resolve(window.__openclerkScribe);
        } else {
          reject(new Error("Could not initialize PDF/OCR support."));
        }
      };
      script.onerror = () => reject(new Error("Could not load PDF/OCR support."));
      document.head.appendChild(script);
    });
  }
  return scribeLoadPromise;
}

// Standard browser download plumbing. Duplicated (not imported from editor/exportDocument.ts) so
// this bundle doesn't drag in that module's JSZip dependency -- same bundle-size reasoning as
// isSafeHyperlinkUrl above.
function downloadBlob(data: ArrayBuffer, filename: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function handleSearchablePdfExport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) {
    return;
  }
  try {
    setStudioStatus(`Preparing a searchable PDF from "${file.name}" (OCR can take a while)...`);
    const scribe = await ensureScribe();
    const buffer = await scribe.exportSearchablePdf(file, { onProgress: setStudioStatus });
    const base = file.name.replace(/\.pdf$/i, "");
    downloadBlob(buffer, `${base}-searchable.pdf`, "application/pdf");
    setStudioStatus(`Downloaded "${base}-searchable.pdf".`);
  } catch (error) {
    setStudioStatus(error instanceof Error ? error.message : String(error));
  }
}

// ---- Edit menu ----
// Undo/Redo forward to the existing formatting-toolbar buttons rather than calling execCommand
// directly, so the (jsdom-guarded) execCommand handling in formatting.ts stays the single source
// of truth. Select all uses the Selection API on the document surface.

function selectAllDocument(): void {
  const doc = $("document-surface");
  if (!doc) {
    return;
  }
  doc.focus();
  const range = document.createRange();
  range.selectNodeContents(doc);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function wireEditMenu(): void {
  $("stu-edit-undo")?.addEventListener("click", () => $("format-undo-button")?.click());
  $("stu-edit-redo")?.addEventListener("click", () => $("format-redo-button")?.click());
  $("stu-edit-select-all")?.addEventListener("click", selectAllDocument);
}

// ---- View menu ----
// Toggles the visibility of the outline sidebar and the comment gutter, giving the document more
// room. Each item is a menuitemcheckbox: its aria-checked and leading checkmark reflect whether
// the panel is currently shown.

function toggleView(panelId: string, buttonId: string): void {
  const panel = $(panelId);
  const button = $(buttonId);
  if (!panel) {
    return;
  }
  const nowHidden = panel.classList.toggle("stu-hidden");
  button?.setAttribute("aria-checked", String(!nowHidden));
  const check = button?.querySelector<HTMLElement>("[data-check]");
  if (check) {
    // U+2713 check mark when shown, nothing when hidden (kept in a fixed-width icon slot so the
    // label doesn't shift).
    check.textContent = nowHidden ? "" : "✓";
  }
}

function wireViewMenu(): void {
  $("stu-view-toggle-outline")?.addEventListener("click", () => toggleView("stu-outline", "stu-view-toggle-outline"));
  $("stu-view-toggle-gutter")?.addEventListener("click", () => toggleView("stu-gutter", "stu-view-toggle-gutter"));
}

// ---- Wiring ----

function init(): void {
  wireDropdown("stu-edit-menu-trigger", "stu-edit-menu");
  wireDropdown("stu-view-menu-trigger", "stu-view-menu");
  wireDropdown("stu-file-menu-trigger", "stu-file-menu");
  wireDropdown("stu-cite-menu-trigger", "stu-cite-menu");
  wireDropdown("stu-insert-menu-trigger", "stu-insert-menu");
  document.addEventListener("click", closeAllDropdowns);
  wireCitationsMenu();
  wireEditMenu();
  wireViewMenu();
  $("stu-insert-hyperlink")?.addEventListener("click", insertHyperlink);

  // Route Studio's PDF import through scribe (better OCR + font styles) by pre-setting the seam
  // editor-bundle.js already consumes. The wrapper is set immediately but loads scribe lazily, so
  // loading a .pdf via "Load from file" here uses scribe instead of the tesseract editor-pdf-bundle.
  window.__openclerkExtractPdfText = (file, options) =>
    ensureScribe().then((scribe) => scribe.extractPdfText(file, { onProgress: options?.onProgress }));
  $("stu-save-searchable-pdf")?.addEventListener("click", () => $("stu-searchable-pdf-input")?.click());
  $("stu-searchable-pdf-input")?.addEventListener("change", handleSearchablePdfExport);

  openWorkflow("manage-hyperlinks");
  closeWorkflow();

  refreshOutline();
  refreshWordCount();
  refreshEditionLabel();
  refreshHealthAndGutter();

  const doc = $("document-surface");
  if (doc) {
    let debounceHandle: number | undefined;
    const observer = new MutationObserver(() => {
      window.clearTimeout(debounceHandle);
      debounceHandle = window.setTimeout(() => {
        refreshOutline();
        refreshWordCount();
      }, 200);
    });
    observer.observe(doc, { childList: true, subtree: true, characterData: true });
  }

  $("bluebook-edition-select")?.addEventListener("change", refreshEditionLabel);

  ["bluebook-issue-list", "hallucination-results-list"].forEach((id) => {
    const container = $(id);
    if (!container) {
      return;
    }
    new MutationObserver(refreshHealthAndGutter).observe(container, { childList: true, subtree: true });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export {
  init,
  openWorkflow,
  closeWorkflow,
  refreshOutline,
  refreshWordCount,
  refreshHealthAndGutter,
  insertHyperlink,
  ensureScribe,
  handleSearchablePdfExport,
  selectAllDocument,
  toggleView,
};
