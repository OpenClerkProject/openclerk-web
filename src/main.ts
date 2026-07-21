import {
  type BluebookIssue,
  bluebookRuleSetRegistry,
  extractCaseCitations,
  parseCaseCitation,
} from "openclerk-core";
import { extractTextFromFile } from "./fileText";

interface CitationResult {
  raw: string;
  parseFailed: boolean;
  issues: BluebookIssue[];
}

function populateEditions(): void {
  const select = document.getElementById("edition-select") as HTMLSelectElement;
  select.innerHTML = "";
  bluebookRuleSetRegistry.list().forEach((ruleSet) => {
    const option = document.createElement("option");
    option.value = ruleSet.id;
    option.textContent = ruleSet.name;
    select.appendChild(option);
  });
  renderEditionDescription();
}

function renderEditionDescription(): void {
  const select = document.getElementById("edition-select") as HTMLSelectElement;
  const ruleSet = bluebookRuleSetRegistry.get(select.value);
  const descriptionEl = document.getElementById("edition-description")!;
  descriptionEl.textContent = ruleSet ? ruleSet.description : "";
}

function checkCitations(): void {
  const select = document.getElementById("edition-select") as HTMLSelectElement;
  const ruleSet = bluebookRuleSetRegistry.get(select.value);
  const textarea = document.getElementById("citation-input") as HTMLTextAreaElement;
  const statusEl = document.getElementById("status")!;
  const resultsEl = document.getElementById("results")!;
  resultsEl.innerHTML = "";

  if (!ruleSet) {
    statusEl.textContent = "Choose a Bluebook edition first.";
    return;
  }

  const candidates = extractCaseCitations(textarea.value);
  if (candidates.length === 0) {
    statusEl.textContent = "No case citations were found in the pasted text.";
    return;
  }

  let results: CitationResult[];
  try {
    results = candidates.map((raw) => {
      const parsed = parseCaseCitation(raw);
      return {
        raw,
        parseFailed: parsed === null,
        issues: parsed ? ruleSet.checkCitation(parsed) : [],
      };
    });
  } catch (error) {
    statusEl.textContent = `Something went wrong while checking citations. ${
      error instanceof Error ? error.message : String(error)
    }`;
    return;
  }

  const flaggedCount = results.filter(
    (result) => result.parseFailed || result.issues.length > 0,
  ).length;
  const errorCount = results.reduce(
    (count, result) => count + result.issues.filter((issue) => issue.severity === "error").length,
    0,
  );
  const warningCount = results.reduce(
    (count, result) => count + result.issues.filter((issue) => issue.severity === "warning").length,
    0,
  );

  statusEl.textContent =
    `Checked ${candidates.length} citation(s) against the ${ruleSet.name}; ` +
    `${flaggedCount} flagged (${errorCount} error(s), ${warningCount} warning(s)).`;

  results.forEach((result) => resultsEl.appendChild(renderResult(result)));
}

async function handleFileUpload(): Promise<void> {
  const fileInput = document.getElementById("file-input") as HTMLInputElement;
  const fileStatusEl = document.getElementById("file-status")!;
  const textarea = document.getElementById("citation-input") as HTMLTextAreaElement;
  const file = fileInput.files?.[0];

  if (!file) {
    return;
  }

  fileStatusEl.textContent = `Reading "${file.name}"...`;

  try {
    const text = await extractTextFromFile(file);
    textarea.value = text;
    fileStatusEl.textContent = `Loaded "${file.name}" (${text.length.toLocaleString()} characters). Click "Check citations" to scan it.`;
  } catch (error) {
    fileStatusEl.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    fileInput.value = "";
  }
}

function statusClass(result: CitationResult): string {
  if (result.parseFailed) {
    return "status-warning";
  }
  if (result.issues.length === 0) {
    return "status-ok";
  }
  return result.issues.some((issue) => issue.severity === "error")
    ? "status-error"
    : "status-warning";
}

function renderResult(result: CitationResult): HTMLElement {
  const item = document.createElement("div");
  item.className = `issue-item ${statusClass(result)}`;

  const citationEl = document.createElement("p");
  citationEl.className = "issue-citation";
  citationEl.textContent = result.raw;
  item.appendChild(citationEl);

  if (result.parseFailed) {
    const p = document.createElement("p");
    p.className = "issue-message issue-warning";
    p.textContent = "Could not be parsed as a case citation.";
    item.appendChild(p);
  } else if (result.issues.length === 0) {
    const p = document.createElement("p");
    p.className = "issue-message issue-clean";
    p.textContent = "No obvious mechanical problems.";
    item.appendChild(p);
  } else {
    result.issues.forEach((issue) => {
      const p = document.createElement("p");
      p.className = `issue-message issue-${issue.severity}`;
      const tag = document.createElement("span");
      tag.className = "rule-tag";
      tag.textContent = issue.ruleId;
      p.appendChild(tag);
      p.appendChild(document.createTextNode(issue.message));
      item.appendChild(p);
    });
  }

  return item;
}

function init(): void {
  populateEditions();
  const coreVersionEl = document.getElementById("core-version");
  if (coreVersionEl) {
    coreVersionEl.textContent = ` v${__OPENCLERK_CORE_VERSION__}`;
  }
  document.getElementById("edition-select")!.addEventListener("change", renderEditionDescription);
  document.getElementById("check-button")!.addEventListener("click", checkCitations);
  document.getElementById("file-input")!.addEventListener("change", handleFileUpload);
  document.getElementById("citation-input")!.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Enter" && (keyboardEvent.ctrlKey || keyboardEvent.metaKey)) {
      keyboardEvent.preventDefault();
      checkCitations();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { init, checkCitations, populateEditions, handleFileUpload };
