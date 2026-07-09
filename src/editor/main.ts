import {
  bluebookRuleSetRegistry,
  citationProviderRegistry,
  extractCaseCitations,
  extractParentheticalCitations,
  expandPincitePages,
  isSafeHyperlinkUrl,
  parseCaseCitation,
  supportsOpinionText,
  supportsRateLimitAwareness,
  BluebookIssue,
  BluebookRuleSet,
  CitationProvider,
  OpinionTextCapableProvider,
  ParsedCitation,
} from "openclerk-core";
import { extractTextFromFile } from "../fileText";
import { findMatches, flashOccurrence, getPlainText, isInsideMatch, unwrapElements, wrapRange } from "./dom";

type TabId = "manage-hyperlinks" | "bluebook-check" | "hallucination-check" | "embed-cited-text";
type ParentheticalEntry = { citation: string; url: string; id: string };
type HallucinationProviderEntry = { id: string; checked: boolean };
type HallucinationResult = {
  raw: string;
  verifiedVia: string | null;
  skippedProviders: string[];
  rateLimitedProviders: string[];
};
type BluebookCheckedCitation = { raw: string; parsed: ParsedCitation | null; issues: BluebookIssue[] };
type EmbedTextResult = { raw: string; embedded: boolean; reason: string | null };

const CASE_HYPERLINK_CLASS = "oc-case-hyperlink";
const PARENTHETICAL_HYPERLINK_CLASS = "oc-parenthetical-hyperlink";
const EMBED_NOTE_CLASS = "oc-embed-note";
const EMBED_EXCERPT_CLASS = "oc-embed-excerpt";

let parentheticalEntries: ParentheticalEntry[] = [];
let hallucinationProviderOrder: HallucinationProviderEntry[] = [];
let lastBluebookResults: BluebookCheckedCitation[] | null = null;
let bluebookShowFlaggedOnly = false;

function getDocumentSurface(): HTMLElement {
  return document.getElementById("document-surface") as HTMLElement;
}

function setStatus(message: string): void {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function button(id: string): HTMLButtonElement | null {
  return document.getElementById(id) as HTMLButtonElement | null;
}

// Disables `btn` (and marks it aria-busy) for the duration of `action`, and -- when
// `lockDocument` is true -- also makes the document surface temporarily non-editable. Both guard
// against the same underlying problem: a workflow here reads the document into DOM Text-node
// Ranges up front and mutates them after an async provider lookup, so a second click or a live
// edit landing mid-run could operate on stale positions or duplicate work already in flight.
async function withBusyButton(btn: HTMLButtonElement | null, lockDocument: boolean, action: () => Promise<void>): Promise<void> {
  const root = lockDocument ? getDocumentSurface() : null;
  if (btn) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
  }
  if (root) {
    root.contentEditable = "false";
  }
  try {
    await action();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
    if (root) {
      root.contentEditable = "true";
    }
  }
}

// ---- Document loading ----

function setDocumentText(root: HTMLElement, text: string): void {
  root.innerHTML = "";
  text.split("\n").forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    root.appendChild(p);
  });
}

async function handleDocumentFileUpload(): Promise<void> {
  const fileInput = document.getElementById("load-file-input") as HTMLInputElement;
  const statusEl = document.getElementById("load-file-status")!;
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    return;
  }

  statusEl.textContent = `Reading "${file.name}"...`;
  try {
    const text = await extractTextFromFile(file);
    setDocumentText(getDocumentSurface(), text);
    statusEl.textContent = `Loaded "${file.name}" (${text.length.toLocaleString()} characters) into the document.`;
    invalidateWorkflowResults();
  } catch (error) {
    statusEl.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    fileInput.value = "";
  }
}

function clearDocument(): void {
  getDocumentSurface().innerHTML = "<p><br></p>";
  invalidateWorkflowResults();
  setStatus("Document cleared.");
}

function invalidateWorkflowResults(): void {
  lastBluebookResults = null;
  renderBluebookResults();
  parentheticalEntries = [];
  renderParentheticalEntries();
  renderHallucinationResults([]);
  renderEmbedTextResults([]);
}

// ---- Tabs ----

const TAB_PANEL_IDS: Record<TabId, string> = {
  "manage-hyperlinks": "manage-hyperlinks-panel",
  "bluebook-check": "bluebook-check-panel",
  "hallucination-check": "hallucination-check-panel",
  "embed-cited-text": "embed-cited-text-panel",
};

function setActiveTab(tabName: TabId): void {
  (Object.keys(TAB_PANEL_IDS) as TabId[]).forEach((id) => {
    document.getElementById(TAB_PANEL_IDS[id])?.classList.toggle("active", id === tabName);
  });
}

// ---- Manage Hyperlinks: Online Lookup provider panel ----

function populateProviderSelect(): void {
  const select = document.getElementById("provider-select") as HTMLSelectElement | null;
  if (!select) {
    return;
  }
  select.innerHTML = "";
  citationProviderRegistry.list().forEach((provider) => {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.name;
    select.appendChild(option);
  });
  renderProviderPanel();
}

function getSelectedProvider(): CitationProvider | undefined {
  const select = document.getElementById("provider-select") as HTMLSelectElement | null;
  if (!select || !select.value) {
    return undefined;
  }
  return citationProviderRegistry.get(select.value);
}

function renderProviderPanel(): void {
  const provider = getSelectedProvider();
  const descriptionEl = document.getElementById("provider-description");
  const fieldsContainer = document.getElementById("provider-credential-fields");

  if (descriptionEl) {
    descriptionEl.textContent = provider?.description || "";
  }

  if (fieldsContainer) {
    fieldsContainer.innerHTML = "";
    provider?.credentialFields.forEach((field) => {
      const row = document.createElement("div");
      row.className = "citation-row";

      const label = document.createElement("label");
      label.setAttribute("for", `credential-${provider.id}-${field.key}`);
      label.textContent = field.label;

      const input = document.createElement("input");
      input.id = `credential-${provider.id}-${field.key}`;
      input.className = "url-input";
      input.type = field.type;
      if (field.placeholder) {
        input.placeholder = field.placeholder;
      }

      row.appendChild(label);
      row.appendChild(input);
      fieldsContainer.appendChild(row);
    });
  }

  updateProviderAuthStatus();
}

function updateProviderAuthStatus(): void {
  const provider = getSelectedProvider();
  const statusEl = document.getElementById("provider-auth-status");
  if (!statusEl) {
    return;
  }
  if (!provider) {
    statusEl.textContent = "";
  } else if (!provider.requiresAuth) {
    statusEl.textContent = "Ready to use (no sign-in required).";
  } else {
    statusEl.textContent = provider.isAuthenticated() ? "Connected." : "Not connected.";
  }
}

async function connectSelectedProvider(): Promise<void> {
  const provider = getSelectedProvider();
  if (!provider) {
    return;
  }

  const credentials: Record<string, string> = {};
  provider.credentialFields.forEach((field) => {
    const input = document.getElementById(`credential-${provider.id}-${field.key}`) as HTMLInputElement | null;
    credentials[field.key] = input?.value ?? "";
  });

  setStatus(`Connecting to ${provider.name}...`);
  try {
    await provider.authenticate(credentials);
    setStatus(`Connected to ${provider.name}.`);
  } catch (error) {
    setStatus(`Unable to connect to ${provider.name}. ${error instanceof Error ? error.message : String(error)}`);
  }
  updateProviderAuthStatus();
}

function disconnectSelectedProvider(): void {
  const provider = getSelectedProvider();
  if (!provider) {
    return;
  }
  provider.signOut();
  setStatus(`Disconnected from ${provider.name}.`);
  updateProviderAuthStatus();
}

// ---- Manage Hyperlinks: case-law citations via Online Lookup ----

async function applyHyperlinksViaProvider(): Promise<void> {
  const provider = getSelectedProvider();
  if (!provider) {
    setStatus("Choose a lookup provider first.");
    return;
  }
  if (provider.requiresAuth && !provider.isAuthenticated()) {
    setStatus(`Connect to ${provider.name} first.`);
    return;
  }

  const root = getDocumentSurface();
  setStatus(`Scanning the document for citations to look up via ${provider.name}...`);

  const candidates = extractCaseCitations(getPlainText(root));
  if (candidates.length === 0) {
    setStatus("No case citations were found in the document.");
    return;
  }

  let linkedCount = 0;
  let skippedCount = 0;
  let rateLimitedCount = 0;

  // One at a time (not in parallel), to stay within each provider's rate limits -- same
  // reasoning as openclerk-word's equivalent workflow.
  for (const raw of candidates) {
    const allMatches = findMatches(root, raw);
    if (allMatches.length === 0) {
      skippedCount += 1;
      continue;
    }

    const unlinkedMatches = allMatches.filter((m) => !isInsideMatch(m.range.startContainer, root, "a"));
    if (unlinkedMatches.length === 0) {
      linkedCount += 1;
      continue;
    }

    const parsed = parseCaseCitation(raw) || { raw };
    const match = await provider.lookupCitation(parsed);
    if (!match || !isSafeHyperlinkUrl(match.url)) {
      if (supportsRateLimitAwareness(provider) && provider.wasLastRequestRateLimited()) {
        rateLimitedCount += 1;
      } else {
        skippedCount += 1;
      }
      continue;
    }

    unlinkedMatches.forEach((m) => {
      wrapRange(m.range, () => {
        const a = document.createElement("a");
        a.className = CASE_HYPERLINK_CLASS;
        a.href = match.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.title = match.citation ? `${match.citation} — via ${provider.name}` : `Via ${provider.name}`;
        return a;
      });
    });
    linkedCount += 1;
  }

  const rateLimitNote =
    rateLimitedCount > 0
      ? ` ${rateLimitedCount} were rate-limited by ${provider.name} -- wait a minute and click "Scan & hyperlink" again to pick up the rest.`
      : "";
  setStatus(
    `Linked ${linkedCount} of ${candidates.length} citation(s) via ${provider.name}. ` +
      `${skippedCount} could not be resolved and were left unchanged.${rateLimitNote}`
  );
}

async function removeCaseLawHyperlinks(): Promise<void> {
  const removed = unwrapElements(getDocumentSurface(), `a.${CASE_HYPERLINK_CLASS}`);
  setStatus(`Removed ${removed} hyperlink(s).`);
}

// ---- Manage Hyperlinks: non-case-law parenthetical citations ----

async function scanParentheticalCitations(): Promise<void> {
  const citations = extractParentheticalCitations(getPlainText(getDocumentSurface()));
  parentheticalEntries = citations.map((citation, index) => ({ citation, url: "", id: `parenthetical-${index}` }));
  renderParentheticalEntries();
  setStatus(
    parentheticalEntries.length === 0
      ? "No parenthetical citations were found in the document."
      : `Found ${parentheticalEntries.length} parenthetical citation(s).`
  );
}

async function addParentheticalHyperlinks(): Promise<void> {
  if (parentheticalEntries.length === 0) {
    setStatus("Scan the document for parenthetical citations first.");
    return;
  }

  const root = getDocumentSurface();
  const validEntries = parentheticalEntries
    .map((entry) => ({ ...entry, url: entry.url.trim() }))
    .filter((entry) => entry.url && isSafeHyperlinkUrl(entry.url));

  let addedCount = 0;
  for (const entry of validEntries) {
    const matches = findMatches(root, entry.citation).filter((m) => !isInsideMatch(m.range.startContainer, root, "a"));
    matches.forEach((m) => {
      const wrapped = wrapRange(m.range, () => {
        const a = document.createElement("a");
        a.className = PARENTHETICAL_HYPERLINK_CLASS;
        a.href = entry.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        return a;
      });
      if (wrapped) {
        addedCount += 1;
      }
    });
  }

  setStatus(`Added ${addedCount} hyperlink(s) to parenthetical citations.`);
}

async function removeParentheticalHyperlinks(): Promise<void> {
  const removed = unwrapElements(getDocumentSurface(), `a.${PARENTHETICAL_HYPERLINK_CLASS}`);
  setStatus(`Removed ${removed} hyperlink(s).`);
}

function renderParentheticalEntries(): void {
  const container = document.getElementById("parenthetical-citation-list");
  if (!container) {
    return;
  }

  container.innerHTML = "";
  if (parentheticalEntries.length === 0) {
    container.innerHTML = '<p class="helper-text">No parenthetical citations found yet.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  parentheticalEntries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "citation-row";

    const label = document.createElement("label");
    label.setAttribute("for", entry.id);
    label.textContent = entry.citation;

    const input = document.createElement("input");
    input.id = entry.id;
    input.className = "url-input";
    input.type = "text";
    input.placeholder = "https://example.com";
    input.value = entry.url;
    input.addEventListener("input", () => {
      entry.url = input.value;
    });

    row.appendChild(label);
    row.appendChild(input);
    fragment.appendChild(row);
  });
  container.appendChild(fragment);
}

// ---- Bluebook Check ----

function populateBluebookEditionSelect(): void {
  const select = document.getElementById("bluebook-edition-select") as HTMLSelectElement | null;
  if (!select) {
    return;
  }
  select.innerHTML = "";
  bluebookRuleSetRegistry.list().forEach((ruleSet) => {
    const option = document.createElement("option");
    option.value = ruleSet.id;
    option.textContent = ruleSet.name;
    select.appendChild(option);
  });
  renderBluebookEditionDescription();
}

function getSelectedBluebookRuleSet(): BluebookRuleSet | undefined {
  const select = document.getElementById("bluebook-edition-select") as HTMLSelectElement | null;
  if (!select || !select.value) {
    return undefined;
  }
  return bluebookRuleSetRegistry.get(select.value);
}

function renderBluebookEditionDescription(): void {
  const ruleSet = getSelectedBluebookRuleSet();
  const descriptionEl = document.getElementById("bluebook-edition-description");
  if (descriptionEl) {
    descriptionEl.textContent = ruleSet?.description || "";
  }
}

function invalidateBluebookResults(): void {
  if (lastBluebookResults === null) {
    return;
  }
  lastBluebookResults = null;
  const summary = document.getElementById("bluebook-results-summary");
  if (summary) {
    summary.textContent = "";
  }
  const container = document.getElementById("bluebook-issue-list");
  if (container) {
    container.innerHTML =
      '<p class="helper-text">The Bluebook edition changed -- click "Check citations" again to see results for the new edition.</p>';
  }
}

async function checkBluebookCitations(): Promise<void> {
  const ruleSet = getSelectedBluebookRuleSet();
  if (!ruleSet) {
    setStatus("Choose a Bluebook edition first.");
    return;
  }

  const candidates = extractCaseCitations(getPlainText(getDocumentSurface()));

  try {
    lastBluebookResults = candidates.map((raw) => {
      const parsed = parseCaseCitation(raw);
      return { raw, parsed, issues: parsed ? ruleSet.checkCitation(parsed) : [] };
    });
  } catch (error) {
    setStatus(`Something went wrong while checking citations. ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  renderBluebookResults();

  if (candidates.length === 0) {
    setStatus("No case citations were found in the document.");
    return;
  }

  const errorCount = lastBluebookResults.reduce(
    (count, result) => count + result.issues.filter((issue) => issue.severity === "error").length,
    0
  );
  const warningCount = lastBluebookResults.reduce(
    (count, result) => count + result.issues.filter((issue) => issue.severity === "warning").length,
    0
  );
  const flaggedCount = lastBluebookResults.filter((result) => !result.parsed || result.issues.length > 0).length;

  setStatus(
    `Checked ${candidates.length} citation(s) against the ${ruleSet.name}; ${flaggedCount} flagged ` +
      `(${errorCount} error(s), ${warningCount} warning(s)).`
  );
}

function goToCitationInDocument(raw: string): void {
  const found = flashOccurrence(getDocumentSurface(), raw);
  setStatus(found ? `Jumped to "${raw}".` : `Could not find "${raw}" in the document.`);
}

function renderBluebookResults(): void {
  const container = document.getElementById("bluebook-issue-list");
  const summaryEl = document.getElementById("bluebook-results-summary");
  if (!container) {
    return;
  }

  container.innerHTML = "";
  if (summaryEl) {
    summaryEl.innerHTML = "";
  }

  if (lastBluebookResults === null) {
    container.innerHTML = '<p class="helper-text">No case citations found yet. Click "Check citations".</p>';
    return;
  }
  if (lastBluebookResults.length === 0) {
    container.innerHTML = '<p class="helper-text">No case citations were found in the document.</p>';
    return;
  }

  const errorCount = lastBluebookResults.reduce(
    (count, result) => count + result.issues.filter((issue) => issue.severity === "error").length,
    0
  );
  const warningCount = lastBluebookResults.reduce(
    (count, result) => count + result.issues.filter((issue) => issue.severity === "warning").length,
    0
  );
  const cleanCount = lastBluebookResults.filter((result) => result.parsed && result.issues.length === 0).length;

  if (summaryEl) {
    const parts: { text: string; className: string }[] = [];
    if (errorCount > 0) {
      parts.push({ text: `${errorCount} error${errorCount === 1 ? "" : "s"}`, className: "summary-errors" });
    }
    if (warningCount > 0) {
      parts.push({ text: `${warningCount} warning${warningCount === 1 ? "" : "s"}`, className: "summary-warnings" });
    }
    parts.push({ text: `${cleanCount} clean`, className: "summary-ok" });
    parts.forEach((part, index) => {
      const span = document.createElement("span");
      span.className = part.className;
      span.textContent = part.text;
      summaryEl.appendChild(span);
      if (index < parts.length - 1) {
        summaryEl.appendChild(document.createTextNode(" · "));
      }
    });
  }

  const visibleResults = bluebookShowFlaggedOnly
    ? lastBluebookResults.filter((result) => !result.parsed || result.issues.length > 0)
    : lastBluebookResults;

  if (visibleResults.length === 0) {
    container.innerHTML = '<p class="helper-text">No flagged citations -- everything checked out clean.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  visibleResults.forEach(({ raw, parsed, issues }) => {
    const row = document.createElement("div");
    row.className = "bluebook-issue-row";

    const label = document.createElement("button");
    label.type = "button";
    label.className = "citation-link";
    label.title = "Click to find this citation in the document";
    label.textContent = raw;
    label.addEventListener("click", () => goToCitationInDocument(raw));
    row.appendChild(label);

    if (!parsed) {
      const result = document.createElement("p");
      result.className = "helper-text issue-flagged";
      result.textContent =
        "Could not parse this citation's structure -- this can mean a real formatting problem, or just a " +
        "citation shape this tool doesn't yet recognize. Verify it manually.";
      row.appendChild(result);
    } else if (issues.length === 0) {
      const result = document.createElement("p");
      result.className = "helper-text issue-ok";
      result.textContent = "No issues found.";
      row.appendChild(result);
    } else {
      const list = document.createElement("ul");
      list.className = "bluebook-issue-item-list";
      issues.forEach((issue) => {
        const item = document.createElement("li");
        item.className = `bluebook-issue-item severity-${issue.severity}`;
        item.textContent = `${issue.severity === "error" ? "Error" : "Warning"}: ${issue.message}`;
        list.appendChild(item);
      });
      row.appendChild(list);
    }

    fragment.appendChild(row);
  });
  container.appendChild(fragment);
}

// ---- Find Hallucinations ----

function populateHallucinationProviderList(): void {
  hallucinationProviderOrder = citationProviderRegistry.list().map((provider) => ({ id: provider.id, checked: false }));
  renderHallucinationProviderList();
}

function renderHallucinationProviderList(): void {
  const container = document.getElementById("hallucination-provider-list");
  if (!container) {
    return;
  }
  container.innerHTML = "";

  const fragment = document.createDocumentFragment();
  hallucinationProviderOrder.forEach((entry, index) => {
    const provider = citationProviderRegistry.get(entry.id);
    if (!provider) {
      return;
    }

    const row = document.createElement("div");
    row.className = "hallucination-provider-row";

    const label = document.createElement("label");
    label.className = "hallucination-provider-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = entry.checked;
    checkbox.addEventListener("change", () => {
      entry.checked = checkbox.checked;
    });

    const nameSpan = document.createElement("span");
    const authNote = provider.requiresAuth && !provider.isAuthenticated() ? " (not connected)" : "";
    nameSpan.textContent = `${index + 1}. ${provider.name}${authNote}`;

    label.appendChild(checkbox);
    label.appendChild(nameSpan);
    row.appendChild(label);

    const moveButtons = document.createElement("div");
    moveButtons.className = "hallucination-move-buttons";

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "move-button";
    upButton.textContent = "↑";
    upButton.title = "Move up";
    upButton.disabled = index === 0;
    upButton.addEventListener("click", () => moveHallucinationProvider(index, -1));

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.className = "move-button";
    downButton.textContent = "↓";
    downButton.title = "Move down";
    downButton.disabled = index === hallucinationProviderOrder.length - 1;
    downButton.addEventListener("click", () => moveHallucinationProvider(index, 1));

    moveButtons.appendChild(upButton);
    moveButtons.appendChild(downButton);
    row.appendChild(moveButtons);

    fragment.appendChild(row);
  });
  container.appendChild(fragment);
}

function moveHallucinationProvider(index: number, delta: number): void {
  const newIndex = index + delta;
  if (newIndex < 0 || newIndex >= hallucinationProviderOrder.length) {
    return;
  }
  const [entry] = hallucinationProviderOrder.splice(index, 1);
  hallucinationProviderOrder.splice(newIndex, 0, entry);
  renderHallucinationProviderList();
}

async function checkForHallucinations(): Promise<void> {
  const selectedProviders = hallucinationProviderOrder
    .filter((entry) => entry.checked)
    .map((entry) => citationProviderRegistry.get(entry.id))
    .filter((provider): provider is CitationProvider => Boolean(provider));

  if (selectedProviders.length === 0) {
    setStatus("Select at least one platform to check citations against.");
    return;
  }

  setStatus("Scanning the document for citations to verify...");

  const candidates = extractCaseCitations(getPlainText(getDocumentSurface()));
  if (candidates.length === 0) {
    renderHallucinationResults([]);
    setStatus("No case citations were found in the document.");
    return;
  }

  const results: HallucinationResult[] = [];

  // One citation, one provider, at a time -- same rate-limit reasoning as Online Lookup.
  for (const raw of candidates) {
    const parsed = parseCaseCitation(raw) || { raw };
    let verifiedVia: string | null = null;
    const skippedProviders: string[] = [];
    const rateLimitedProviders: string[] = [];

    for (const provider of selectedProviders) {
      if (provider.requiresAuth && !provider.isAuthenticated()) {
        skippedProviders.push(provider.name);
        continue;
      }
      const match = await provider.lookupCitation(parsed);
      if (match) {
        verifiedVia = provider.name;
        break;
      }
      if (supportsRateLimitAwareness(provider) && provider.wasLastRequestRateLimited()) {
        rateLimitedProviders.push(provider.name);
      }
    }

    results.push({ raw, verifiedVia, skippedProviders, rateLimitedProviders });
  }

  renderHallucinationResults(results);

  const rateLimitedCount = results.filter((result) => !result.verifiedVia && result.rateLimitedProviders.length > 0).length;
  const flaggedCount = results.filter((result) => !result.verifiedVia && result.rateLimitedProviders.length === 0).length;
  const rateLimitNote =
    rateLimitedCount > 0
      ? ` ${rateLimitedCount} could not be checked because a platform rate-limited the request -- wait a minute and try again.`
      : "";
  setStatus(
    `Checked ${results.length} citation(s) against ${selectedProviders.length} platform(s); ` +
      `${flaggedCount} could not be verified on any selected platform.${rateLimitNote}`
  );
}

function renderHallucinationResults(results: HallucinationResult[]): void {
  const container = document.getElementById("hallucination-results-list");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (results.length === 0) {
    container.innerHTML = '<p class="helper-text">No results yet. Click "Find Hallucinations".</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  results.forEach((result) => {
    const row = document.createElement("div");
    row.className = "bluebook-issue-row";

    const label = document.createElement("button");
    label.type = "button";
    label.className = "citation-link";
    label.title = "Click to find this citation in the document";
    label.textContent = result.raw;
    label.addEventListener("click", () => goToCitationInDocument(result.raw));
    row.appendChild(label);

    const status = document.createElement("p");
    status.className = "helper-text";
    if (result.verifiedVia) {
      status.classList.add("issue-ok");
      status.textContent = `Verified via ${result.verifiedVia}.`;
    } else if (result.rateLimitedProviders.length > 0) {
      status.textContent = `Not checked -- rate-limited by ${result.rateLimitedProviders.join(", ")}. Not a confirmed hallucination; wait a minute and try again.`;
    } else {
      status.classList.add("issue-flagged");
      status.textContent =
        result.skippedProviders.length > 0
          ? `Not found on any connected platform. Not checked (not connected): ${result.skippedProviders.join(", ")}.`
          : "Not found on any selected platform — possible hallucination.";
    }
    row.appendChild(status);

    fragment.appendChild(row);
  });
  container.appendChild(fragment);
}

// ---- Embed Cited Text ----

function populateEmbedTextProviderSelect(): void {
  const select = document.getElementById("embed-text-provider-select") as HTMLSelectElement | null;
  if (!select) {
    return;
  }
  select.innerHTML = "";
  const capableProviders = citationProviderRegistry.list().filter(supportsOpinionText);

  if (capableProviders.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No provider available";
    select.appendChild(option);
    select.disabled = true;
    renderEmbedTextProviderStatus();
    return;
  }

  select.disabled = false;
  capableProviders.forEach((provider) => {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.name;
    select.appendChild(option);
  });
  renderEmbedTextProviderStatus();
}

function getSelectedEmbedTextProvider(): OpinionTextCapableProvider | undefined {
  const select = document.getElementById("embed-text-provider-select") as HTMLSelectElement | null;
  if (!select || !select.value) {
    return undefined;
  }
  const provider = citationProviderRegistry.get(select.value);
  return provider && supportsOpinionText(provider) ? provider : undefined;
}

function renderEmbedTextProviderStatus(): void {
  const statusEl = document.getElementById("embed-text-provider-status");
  if (!statusEl) {
    return;
  }

  const provider = getSelectedEmbedTextProvider();
  statusEl.classList.remove("issue-ok", "issue-flagged");
  if (!provider) {
    statusEl.textContent = "";
    return;
  }

  if (provider.isReadyForOpinionText()) {
    statusEl.classList.add("issue-ok");
    statusEl.textContent = `Ready -- connected to ${provider.name}.`;
  } else {
    statusEl.classList.add("issue-flagged");
    statusEl.textContent = `Not ready -- connect to ${provider.name} with an API token on the Manage Hyperlinks tab first.`;
  }
}

async function embedCitedOpinionText(): Promise<void> {
  const provider = getSelectedEmbedTextProvider();
  if (!provider) {
    setStatus("Choose a provider that supports embedding opinion text first.");
    return;
  }

  const root = getDocumentSurface();
  setStatus(`Scanning the document for pincite citations to embed via ${provider.name}...`);

  const candidates = extractCaseCitations(getPlainText(root));
  const pinciteCitations = candidates
    .map((raw) => ({ raw, parsed: parseCaseCitation(raw) }))
    .filter((item): item is { raw: string; parsed: ParsedCitation } => Boolean(item.parsed?.pincite));

  if (pinciteCitations.length === 0) {
    renderEmbedTextResults([]);
    setStatus("No citations with a pincite (a page beyond the first page) were found in the document.");
    return;
  }

  const results: EmbedTextResult[] = [];

  // One citation at a time -- same rate-limit reasoning as the other provider-backed workflows.
  for (const { raw, parsed } of pinciteCitations) {
    const alreadyEmbedded = Array.from(root.querySelectorAll(`.${EMBED_NOTE_CLASS}`)).some(
      (el) => el.getAttribute("data-citation") === raw
    );
    if (alreadyEmbedded) {
      results.push({ raw, embedded: true, reason: null });
      continue;
    }

    const targetPages = expandPincitePages(parsed.pincite as string);
    const { excerpt, rateLimited } = await provider.fetchOpinionExcerpt(parsed, targetPages);

    if (!excerpt) {
      let reason: string;
      if (rateLimited) {
        reason = `${provider.name} rate-limited this request -- wait a minute and try the remaining citations again.`;
      } else if (!provider.isReadyForOpinionText()) {
        reason = `Connect to ${provider.name} with an API token first.`;
      } else {
        reason = "Opinion text not found, or has no page markers matching this pincite.";
      }
      results.push({ raw, embedded: false, reason });
      continue;
    }

    const matches = findMatches(root, raw);
    const firstMatch = matches[matches.length - 1];
    if (!firstMatch) {
      results.push({ raw, embedded: false, reason: "Could not find this citation's text in the document." });
      continue;
    }

    const wrapped = wrapRange(firstMatch.range, () => {
      const mark = document.createElement("mark");
      mark.className = EMBED_NOTE_CLASS;
      mark.tabIndex = 0;
      mark.setAttribute("role", "button");
      mark.setAttribute("data-citation", raw);
      mark.setAttribute("data-excerpt", excerpt);
      mark.title = "Click to view the cited opinion text";
      return mark;
    });

    if (!wrapped) {
      results.push({ raw, embedded: false, reason: "Could not attach the excerpt to this citation." });
      continue;
    }

    results.push({ raw, embedded: true, reason: null });
  }

  renderEmbedTextResults(results);
  const embeddedCount = results.filter((result) => result.embedded).length;
  setStatus(`Embedded opinion text for ${embeddedCount} of ${pinciteCitations.length} pincite citation(s).`);
}

async function removeEmbeddedCitationText(): Promise<void> {
  const root = getDocumentSurface();
  root.querySelectorAll(`.${EMBED_EXCERPT_CLASS}`).forEach((el) => el.remove());
  const removed = unwrapElements(root, `.${EMBED_NOTE_CLASS}`);
  setStatus(`Removed ${removed} embedded citation text note(s).`);
}

function renderEmbedTextResults(results: EmbedTextResult[]): void {
  const container = document.getElementById("embed-text-results-list");
  const summaryEl = document.getElementById("embed-text-results-summary");
  if (!container) {
    return;
  }

  container.innerHTML = "";
  if (summaryEl) {
    summaryEl.innerHTML = "";
  }
  if (results.length === 0) {
    container.innerHTML = '<p class="helper-text">No results yet. Click "Embed cited opinion text".</p>';
    return;
  }

  const embeddedCount = results.filter((result) => result.embedded).length;
  if (summaryEl) {
    const embeddedSpan = document.createElement("span");
    embeddedSpan.className = "summary-ok";
    embeddedSpan.textContent = `${embeddedCount} embedded`;
    summaryEl.appendChild(embeddedSpan);

    const skippedCount = results.length - embeddedCount;
    if (skippedCount > 0) {
      summaryEl.appendChild(document.createTextNode(" · "));
      const skippedSpan = document.createElement("span");
      skippedSpan.className = "summary-warnings";
      skippedSpan.textContent = `${skippedCount} skipped`;
      summaryEl.appendChild(skippedSpan);
    }
  }

  const fragment = document.createDocumentFragment();
  results.forEach((result) => {
    const row = document.createElement("div");
    row.className = "bluebook-issue-row";

    const label = document.createElement("button");
    label.type = "button";
    label.className = "citation-link";
    label.title = "Click to find this citation in the document";
    label.textContent = result.raw;
    label.addEventListener("click", () => goToCitationInDocument(result.raw));
    row.appendChild(label);

    const status = document.createElement("p");
    status.className = "helper-text";
    if (result.embedded) {
      status.classList.add("issue-ok");
      status.textContent = "Embedded -- click the highlighted citation in the document to expand it.";
    } else {
      status.classList.add("issue-flagged");
      status.textContent = result.reason || "Not embedded.";
    }
    row.appendChild(status);

    fragment.appendChild(row);
  });
  container.appendChild(fragment);
}

function toggleEmbedNote(note: HTMLElement): void {
  const next = note.nextElementSibling;
  if (next && next.classList.contains(EMBED_EXCERPT_CLASS)) {
    next.remove();
    return;
  }
  const span = document.createElement("span");
  span.className = EMBED_EXCERPT_CLASS;
  span.textContent = note.getAttribute("data-excerpt") || "";
  note.insertAdjacentElement("afterend", span);
}

function handleDocumentClick(event: MouseEvent): void {
  const note = (event.target as HTMLElement).closest(`.${EMBED_NOTE_CLASS}`) as HTMLElement | null;
  if (note) {
    event.preventDefault();
    toggleEmbedNote(note);
  }
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const note = (event.target as HTMLElement).closest(`.${EMBED_NOTE_CLASS}`) as HTMLElement | null;
  if (note) {
    event.preventDefault();
    toggleEmbedNote(note);
  }
}

// ---- Init ----

function init(): void {
  populateProviderSelect();
  populateBluebookEditionSelect();
  populateHallucinationProviderList();
  populateEmbedTextProviderSelect();
  renderBluebookResults();
  renderParentheticalEntries();
  setActiveTab("manage-hyperlinks");

  const root = getDocumentSurface();
  root.addEventListener("click", handleDocumentClick);
  root.addEventListener("keydown", handleDocumentKeydown);

  document.getElementById("workflow-select")!.addEventListener("change", (event) => {
    setActiveTab((event.target as HTMLSelectElement).value as TabId);
  });
  document.getElementById("load-file-input")!.addEventListener("change", handleDocumentFileUpload);
  document.getElementById("clear-document-button")!.addEventListener("click", clearDocument);

  document.getElementById("provider-select")!.addEventListener("change", renderProviderPanel);
  document
    .getElementById("provider-connect")!
    .addEventListener("click", () => withBusyButton(button("provider-connect"), false, connectSelectedProvider));
  document
    .getElementById("provider-disconnect")!
    .addEventListener("click", () => withBusyButton(button("provider-disconnect"), false, async () => disconnectSelectedProvider()));
  document
    .getElementById("apply-online-hyperlinks")!
    .addEventListener("click", () => withBusyButton(button("apply-online-hyperlinks"), true, applyHyperlinksViaProvider));
  document
    .getElementById("remove-hyperlinks")!
    .addEventListener("click", () => withBusyButton(button("remove-hyperlinks"), true, removeCaseLawHyperlinks));
  document
    .getElementById("scan-parentheticals")!
    .addEventListener("click", () => withBusyButton(button("scan-parentheticals"), true, scanParentheticalCitations));
  document
    .getElementById("add-parenthetical-hyperlinks")!
    .addEventListener("click", () => withBusyButton(button("add-parenthetical-hyperlinks"), true, addParentheticalHyperlinks));
  document
    .getElementById("remove-parenthetical-hyperlinks")!
    .addEventListener("click", () => withBusyButton(button("remove-parenthetical-hyperlinks"), true, removeParentheticalHyperlinks));

  document.getElementById("bluebook-edition-select")!.addEventListener("change", () => {
    renderBluebookEditionDescription();
    invalidateBluebookResults();
  });
  document
    .getElementById("check-bluebook-citations")!
    .addEventListener("click", () => withBusyButton(button("check-bluebook-citations"), true, checkBluebookCitations));
  document.getElementById("bluebook-show-flagged-only")!.addEventListener("change", (event) => {
    bluebookShowFlaggedOnly = (event.target as HTMLInputElement).checked;
    renderBluebookResults();
  });

  document
    .getElementById("check-hallucinations")!
    .addEventListener("click", () => withBusyButton(button("check-hallucinations"), true, checkForHallucinations));

  document.getElementById("embed-text-provider-select")!.addEventListener("change", renderEmbedTextProviderStatus);
  document
    .getElementById("embed-cited-text")!
    .addEventListener("click", () => withBusyButton(button("embed-cited-text"), true, embedCitedOpinionText));
  document
    .getElementById("remove-embedded-text")!
    .addEventListener("click", () => withBusyButton(button("remove-embedded-text"), true, removeEmbeddedCitationText));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export {
  init,
  setDocumentText,
  handleDocumentFileUpload,
  clearDocument,
  checkBluebookCitations,
  applyHyperlinksViaProvider,
  removeCaseLawHyperlinks,
  scanParentheticalCitations,
  addParentheticalHyperlinks,
  removeParentheticalHyperlinks,
  checkForHallucinations,
  embedCitedOpinionText,
  removeEmbeddedCitationText,
  goToCitationInDocument,
  connectSelectedProvider,
  disconnectSelectedProvider,
};
