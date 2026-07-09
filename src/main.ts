import { bluebookRuleSetRegistry, extractCaseCitations, parseCaseCitation, BluebookIssue } from "openclerk-core";

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

  const results: CitationResult[] = candidates.map((raw) => {
    const parsed = parseCaseCitation(raw);
    return {
      raw,
      parseFailed: parsed === null,
      issues: parsed ? ruleSet.checkCitation(parsed) : [],
    };
  });

  const flaggedCount = results.filter((result) => result.parseFailed || result.issues.length > 0).length;
  const errorCount = results.reduce(
    (count, result) => count + result.issues.filter((issue) => issue.severity === "error").length,
    0
  );
  const warningCount = results.reduce(
    (count, result) => count + result.issues.filter((issue) => issue.severity === "warning").length,
    0
  );

  statusEl.textContent =
    `Checked ${candidates.length} citation(s) against the ${ruleSet.name}; ` +
    `${flaggedCount} flagged (${errorCount} error(s), ${warningCount} warning(s)).`;

  results.forEach((result) => resultsEl.appendChild(renderResult(result)));
}

function renderResult(result: CitationResult): HTMLElement {
  const item = document.createElement("div");
  item.className = "issue-item";

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
      p.className = "issue-message issue-" + issue.severity;
      p.textContent = issue.message;
      item.appendChild(p);
    });
  }

  return item;
}

function init(): void {
  populateEditions();
  document.getElementById("edition-select")!.addEventListener("change", renderEditionDescription);
  document.getElementById("check-button")!.addEventListener("click", checkCitations);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { init, checkCitations, populateEditions };
