// OpenClerk Studio's "chrome" -- the app bar, outline, comment gutter, workflow slide-over, and
// status bar around the Document Editor's actual logic.
//
// This file deliberately knows nothing about citation-checking, hyperlinking, or file formats --
// all of that still lives in editor/main.ts, loaded on this page unmodified as editor-bundle.js
// (studio.html reuses the exact same element IDs main.ts already wires up: #document-surface,
// #workflow-select, #bluebook-issue-list, and so on, just laid out differently). Everything here
// either (a) drives those existing elements the same way a user's mouse would -- setting
// #workflow-select's value and dispatching a real "change" event rather than calling into
// main.ts's internals -- or (b) *observes* DOM output main.ts already produces (the rendered
// rows in #bluebook-issue-list / #hallucination-results-list) to build the outline's "Citation
// Health" summary and the comment gutter. That keeps this file (and studio-bundle.js) completely
// decoupled from editor/main.ts's internals, so editor.html and its bundle are unaffected by
// anything here.

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

// ---- Wiring ----

function init(): void {
  wireDropdown("stu-file-menu-trigger", "stu-file-menu");
  wireDropdown("stu-cite-menu-trigger", "stu-cite-menu");
  wireDropdown("stu-download-menu-trigger", "stu-download-menu");
  document.addEventListener("click", closeAllDropdowns);
  wireCitationsMenu();
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

export { init, openWorkflow, closeWorkflow, refreshOutline, refreshWordCount, refreshHealthAndGutter };
