import {
  clusterCitationTokens,
  extractCitationTokens,
  findOrphanedCitations,
  checkCitationsForHallucinations,
  citationProviderRegistry,
  CitationCluster,
} from "openclerk-core";
import { extractPdfText, PageExtraction } from "./pdfText";

interface CitationReportEntry {
  cluster: CitationCluster;
  verifiedVia?: string | null;
  nameMismatch?: { provider: string; foundCaseName: string };
}

function setStatus(message: string): void {
  document.getElementById("status")!.textContent = message;
}

// Disables `btn` (+ aria-busy) for the duration of `action` -- extraction can run long (OCR falls
// back per page with no embedded text layer), and without this a second click mid-run could kick
// off overlapping work. Same pattern as editor/main.ts's withBusyButton.
async function withBusyButton(btn: HTMLButtonElement | null, action: () => Promise<void>): Promise<void> {
  if (btn) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
  }
  try {
    await action();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  }
}

function handlePdfFileSelected(): void {
  const fileInput = document.getElementById("pdf-input") as HTMLInputElement;
  const statusEl = document.getElementById("pdf-file-status");
  const file = fileInput.files && fileInput.files[0];
  if (statusEl) {
    statusEl.textContent = file ? `Selected "${file.name}".` : "";
  }
}

function renderPages(pages: PageExtraction[]): void {
  const container = document.getElementById("page-summary")!;
  container.textContent = `Extracted ${pages.length} page(s): ${pages.filter((p) => p.source === "embedded").length} from the embedded text layer, ${
    pages.filter((p) => p.source === "ocr").length
  } via OCR, ${pages.filter((p) => p.source === "empty").length} empty.`;
}

function renderCitations(entries: CitationReportEntry[], orphanCount: number): void {
  const container = document.getElementById("results")!;
  container.innerHTML = "";

  if (entries.length === 0) {
    container.textContent = "No case citations were found in the extracted text.";
  }

  entries.forEach(({ cluster, verifiedVia, nameMismatch }) => {
    const item = document.createElement("div");
    item.className = "issue-item";

    const citationEl = document.createElement("p");
    citationEl.className = "issue-citation";
    citationEl.textContent = cluster.leadCitation;
    item.appendChild(citationEl);

    const shortFormCount = cluster.tokens.length - 1;
    if (shortFormCount > 0) {
      const p = document.createElement("p");
      p.className = "issue-message";
      p.textContent = `+${shortFormCount} short-form/Id. reference(s) to this case.`;
      item.appendChild(p);
    }

    if (verifiedVia !== undefined) {
      const p = document.createElement("p");
      if (verifiedVia) {
        p.className = "issue-message issue-clean";
        p.textContent = `Verified via ${verifiedVia}.`;
      } else if (nameMismatch) {
        // A stronger fabrication signal than a plain miss: the citation's locator
        // (reporter/volume/page) is real, but belongs to a different case than the one named here.
        p.className = "issue-message issue-error";
        p.textContent = `Possible hallucination -- ${nameMismatch.provider} resolves this citation to a different case: "${nameMismatch.foundCaseName}".`;
      } else {
        p.className = "issue-message issue-error";
        p.textContent = "Not found by any checked provider -- possible hallucination.";
      }
      item.appendChild(p);
    }

    container.appendChild(item);
  });

  if (orphanCount > 0) {
    const note = document.createElement("p");
    note.className = "issue-message issue-warning";
    note.textContent = `${orphanCount} short-form/Id./supra citation(s) had no resolvable antecedent in the extracted text.`;
    container.appendChild(note);
  }
}

async function runExtraction(): Promise<void> {
  const fileInput = document.getElementById("pdf-input") as HTMLInputElement;
  const verifyCheckbox = document.getElementById("verify-checkbox") as HTMLInputElement;
  const tokenInput = document.getElementById("courtlistener-token") as HTMLInputElement;
  const file = fileInput.files && fileInput.files[0];

  if (!file) {
    setStatus("Choose a PDF file first.");
    return;
  }

  document.getElementById("page-summary")!.textContent = "";
  document.getElementById("results")!.innerHTML = "";
  setStatus("Reading PDF...");

  let pages: PageExtraction[];
  try {
    pages = await extractPdfText(file, { onProgress: setStatus });
  } catch (error) {
    setStatus(`Could not read this file as a PDF. ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  renderPages(pages);
  const fullText = pages.map((page) => page.text).join("\n\n");
  const clusters = clusterCitationTokens(extractCitationTokens(fullText));
  const orphaned = findOrphanedCitations(fullText);

  if (clusters.length === 0) {
    setStatus("No case citations were found in the extracted text.");
    renderCitations([], orphaned.length);
    return;
  }

  const verify = verifyCheckbox.checked && tokenInput.value.trim().length > 0;
  let entries: CitationReportEntry[] = clusters.map((cluster) => ({ cluster }));

  if (verify) {
    setStatus("Checking citations against CourtListener...");
    const provider = citationProviderRegistry.get("courtlistener")!;
    try {
      await provider.authenticate({ apiToken: tokenInput.value.trim() });
      const leadCitations = clusters.map((cluster) => cluster.leadCitation);
      const results = await checkCitationsForHallucinations(leadCitations, [provider]);
      entries = clusters.map((cluster, index) => ({
        cluster,
        verifiedVia: results[index].verifiedVia,
        nameMismatch: results[index].nameMismatch,
      }));
    } catch (error) {
      setStatus(`Could not verify against CourtListener. ${error instanceof Error ? error.message : String(error)}`);
      renderCitations(entries, orphaned.length);
      return;
    }
  }

  const flaggedCount = entries.filter((entry) => entry.verifiedVia === null).length;
  setStatus(
    verify
      ? `Found ${clusters.length} case citation(s); ${flaggedCount} could not be verified via CourtListener.`
      : `Found ${clusters.length} case citation(s).`
  );
  renderCitations(entries, orphaned.length);
}

function init(): void {
  const coreVersionEl = document.getElementById("core-version");
  if (coreVersionEl) {
    coreVersionEl.textContent = ` v${__OPENCLERK_CORE_VERSION__}`;
  }
  document.getElementById("pdf-input")!.addEventListener("change", handlePdfFileSelected);
  document
    .getElementById("extract-button")!
    .addEventListener("click", () =>
      withBusyButton(document.getElementById("extract-button") as HTMLButtonElement | null, runExtraction)
    );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { init, runExtraction };
