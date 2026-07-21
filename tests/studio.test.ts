// studio/chrome.ts deliberately knows nothing about citation-checking logic -- it only drives
// and observes DOM output that editor/main.ts already produces. So each test here requires BOTH
// modules (editor/main.ts first, exactly like editor.test.ts, then studio/chrome.ts), against a
// DOM that's editor.test.ts's fixture plus the studio-only chrome elements layered on top.

function setUpDom(): void {
  document.body.innerHTML = `
    <div id="stu-doc-title"></div>

    <span class="stu-menu-wrap">
      <button type="button" id="stu-edit-menu-trigger"></button>
      <div class="stu-dropdown" id="stu-edit-menu">
        <button type="button" id="stu-edit-undo"></button>
        <button type="button" id="stu-edit-redo"></button>
        <button type="button" id="stu-edit-select-all"></button>
      </div>
    </span>
    <span class="stu-menu-wrap">
      <button type="button" id="stu-view-menu-trigger"></button>
      <div class="stu-dropdown" id="stu-view-menu">
        <button type="button" id="stu-view-toggle-outline" aria-checked="true"><span data-check>&#10003;</span></button>
        <button type="button" id="stu-view-toggle-gutter" aria-checked="true"><span data-check>&#10003;</span></button>
      </div>
    </span>
    <span class="stu-menu-wrap">
      <button type="button" id="stu-file-menu-trigger"></button>
      <div class="stu-dropdown" id="stu-file-menu">
        <label for="load-file-input">Load</label>
        <button type="button" id="stu-import-pdf"></button>
        <input type="file" id="stu-import-pdf-input" />
        <button type="button" id="download-txt-button"></button>
        <button type="button" id="download-odt-button"></button>
        <button type="button" id="stu-save-searchable-pdf"></button>
        <input type="file" id="stu-searchable-pdf-input" />
        <button type="button" id="stu-pdf-to-docx"></button>
        <input type="file" id="stu-pdf-to-docx-input" />
      </div>
    </span>
    <span class="stu-menu-wrap">
      <button type="button" id="stu-insert-menu-trigger"></button>
      <div class="stu-dropdown" id="stu-insert-menu">
        <button type="button" id="stu-insert-hyperlink"></button>
      </div>
    </span>
    <span class="stu-menu-wrap">
      <button type="button" id="stu-cite-menu-trigger"></button>
      <div class="stu-dropdown" id="stu-cite-menu">
        <button type="button" data-panel="manage-hyperlinks"></button>
        <button type="button" data-panel="bluebook-check"></button>
        <button type="button" data-panel="hallucination-check"></button>
        <button type="button" data-panel="embed-cited-text"></button>
      </div>
    </span>

    <input type="file" id="load-file-input" />
    <p id="load-file-status"></p>
    <button type="button" id="clear-document-button"></button>
    <div class="formatting-toolbar">
      <select id="format-block-select">
        <option value="p">Normal text</option>
        <option value="h1">Title</option>
        <option value="h2">Heading 1</option>
        <option value="h3">Heading 2</option>
      </select>
      <button type="button" id="format-bold-button"></button>
      <button type="button" id="format-italic-button"></button>
      <button type="button" id="format-underline-button"></button>
      <button type="button" id="format-bullet-list-button"></button>
      <button type="button" id="format-numbered-list-button"></button>
      <button type="button" id="format-align-left-button"></button>
      <button type="button" id="format-align-justify-button"></button>
      <button type="button" id="format-undo-button"></button>
      <button type="button" id="format-redo-button"></button>
    </div>

    <div id="stu-outline">
      <nav id="stu-outline-list"></nav>
    </div>
    <div id="stu-health-summary"></div>
    <span id="stu-wordcount"></span>
    <span id="stu-edition-label"></span>
    <span id="stu-status-verified"></span>
    <span id="stu-status-warning"></span>
    <span id="stu-status-error"></span>

    <div id="stu-desk">
      <div id="document-surface" contenteditable="true"><p>Placeholder.</p></div>
      <div id="stu-gutter"></div>
    </div>

    <div class="stu-slideover" id="stu-slideover">
      <span id="stu-slideover-title"></span>
      <button type="button" id="stu-slideover-close"></button>

      <select id="workflow-select">
        <option value="manage-hyperlinks">Manage Hyperlinks</option>
        <option value="bluebook-check">Bluebook Check</option>
        <option value="hallucination-check">Find Hallucinations</option>
        <option value="embed-cited-text">Embed Cited Text</option>
      </select>

      <section id="manage-hyperlinks-panel" class="tab-panel active">
        <select id="provider-select"></select>
        <p id="provider-description"></p>
        <div id="provider-credential-fields"></div>
        <button type="button" id="provider-connect"></button>
        <button type="button" id="provider-disconnect"></button>
        <p id="provider-auth-status"></p>
        <button type="button" id="apply-online-hyperlinks"></button>
        <button type="button" id="remove-hyperlinks"></button>
        <button type="button" id="scan-parentheticals"></button>
        <div id="parenthetical-citation-list"></div>
        <button type="button" id="add-parenthetical-hyperlinks"></button>
        <button type="button" id="remove-parenthetical-hyperlinks"></button>
      </section>

      <section id="bluebook-check-panel" class="tab-panel">
        <select id="bluebook-edition-select"></select>
        <p id="bluebook-edition-description"></p>
        <button type="button" id="check-bluebook-citations"></button>
        <input type="checkbox" id="bluebook-show-flagged-only" />
        <p id="bluebook-results-summary"></p>
        <div id="bluebook-issue-list"></div>
      </section>

      <section id="hallucination-check-panel" class="tab-panel">
        <div id="hallucination-provider-list"></div>
        <button type="button" id="check-hallucinations"></button>
        <div id="hallucination-results-list"></div>
      </section>

      <section id="embed-cited-text-panel" class="tab-panel">
        <select id="embed-text-provider-select"></select>
        <p id="embed-text-provider-status"></p>
        <button type="button" id="embed-cited-text"></button>
        <button type="button" id="remove-embedded-text"></button>
        <p id="embed-text-results-summary"></p>
        <div id="embed-text-results-list"></div>
      </section>
    </div>

    <p id="status"></p>
  `;
}

function documentSurface(): HTMLElement {
  return document.getElementById("document-surface") as HTMLElement;
}

// editor/main.ts's checkBluebookCitations() reads real openclerk-core rule data, so a citation
// with a genuine, deterministic (non-network) Bluebook issue exercises the whole pipeline down
// to studio/chrome.ts's rendered health summary and gutter -- "Company" is a real Table T6
// abbreviation the checker flags regardless of edition.
const CLEAN_CITATION = "Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490, 496 (U.S.Ill., 1980)";
const FLAGGED_CITATION = "Smith v. Acme Company, 123 U.S. 456 (1990)";

describe("OpenClerk Studio chrome", () => {
  beforeEach(() => {
    jest.resetModules();
    setUpDom();
    // These window globals persist across tests (jest.resetModules() only resets modules, not the
    // shared window) -- clear the scribe seam so each test starts clean.
    delete (window as unknown as { __openclerkScribe?: unknown }).__openclerkScribe;
    delete (window as unknown as { __openclerkExtractPdfText?: unknown }).__openclerkExtractPdfText;
  });

  it("loads editor/main.ts and studio/chrome.ts together without throwing", () => {
    expect(() => {
      require("../src/editor/main");
      require("../src/studio/chrome");
    }).not.toThrow();
  });

  it("opens the workflow slide-over and switches the active tab-panel via the Citations menu", () => {
    require("../src/editor/main");
    require("../src/studio/chrome");

    document.querySelector<HTMLButtonElement>('[data-panel="bluebook-check"]')!.click();

    expect(document.getElementById("stu-slideover")!.classList.contains("open")).toBe(true);
    expect(document.getElementById("bluebook-check-panel")!.classList.contains("active")).toBe(true);
    expect(document.getElementById("manage-hyperlinks-panel")!.classList.contains("active")).toBe(false);
    expect(document.getElementById("stu-slideover-title")!.textContent).toBe("Bluebook Check");
  });

  it("closes the slide-over from its close button", () => {
    require("../src/editor/main");
    const chrome = require("../src/studio/chrome");
    chrome.openWorkflow("bluebook-check");

    document.getElementById("stu-slideover-close")!.click();

    expect(document.getElementById("stu-slideover")!.classList.contains("open")).toBe(false);
  });

  it("toggles dropdown menus open and closed, and closes them on an outside click", () => {
    require("../src/editor/main");
    require("../src/studio/chrome");

    const trigger = document.getElementById("stu-file-menu-trigger")!;
    const menu = document.getElementById("stu-file-menu")!;

    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(menu.classList.contains("open")).toBe(true);

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(menu.classList.contains("open")).toBe(false);
  });

  it("builds the outline from the document's own h1/h2/h3 headings", () => {
    require("../src/editor/main");
    const chrome = require("../src/studio/chrome");

    documentSurface().innerHTML = "<h1>Title</h1><h2>Section One</h2><p>Body text.</p><h3>Subsection</h3>";
    chrome.refreshOutline();

    const items = Array.from(document.querySelectorAll(".stu-outline-item")).map((el) => el.textContent);
    expect(items).toEqual(["Title", "Section One", "Subsection"]);
  });

  it("shows a placeholder message in the outline when the document has no headings", () => {
    require("../src/editor/main");
    const chrome = require("../src/studio/chrome");

    documentSurface().innerHTML = "<p>No headings here.</p>";
    chrome.refreshOutline();

    expect(document.getElementById("stu-outline-list")!.textContent).toContain("No headings yet");
  });

  it("updates the word count from the document surface's text", () => {
    require("../src/editor/main");
    const chrome = require("../src/studio/chrome");

    documentSurface().innerHTML = "<p>One two three four five.</p>";
    chrome.refreshWordCount();

    expect(document.getElementById("stu-wordcount")!.textContent).toBe("5 words");
  });

  it("populates the Citation Health summary, status bar counts, and comment gutter after a Bluebook check finds a flagged citation", async () => {
    const editor = require("../src/editor/main");
    const chrome = require("../src/studio/chrome");

    documentSurface().innerHTML = `<p>${CLEAN_CITATION}</p><p>${FLAGGED_CITATION}</p>`;
    (document.getElementById("bluebook-edition-select") as HTMLSelectElement).dispatchEvent(new Event("change"));

    await editor.checkBluebookCitations();
    chrome.refreshHealthAndGutter();

    expect(document.getElementById("stu-health-summary")!.textContent).toContain("1 formatting issue");
    expect(document.getElementById("stu-status-warning")!.textContent).toContain("1 issue");

    const cards = document.querySelectorAll(".stu-gutter-card");
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain("Smith v. Acme Company");

    // Clicking the gutter card re-triggers the underlying citation-link button (main.ts's own
    // click-to-jump-in-document behavior) rather than duplicating that logic here.
    expect(() => (cards[0] as HTMLElement).click()).not.toThrow();
  });

  it("shows the empty-state message in Citation Health before any workflow has run", () => {
    require("../src/editor/main");
    const chrome = require("../src/studio/chrome");

    chrome.refreshHealthAndGutter();

    expect(document.getElementById("stu-health-summary")!.textContent).toContain("Run a check");
    expect(document.querySelectorAll(".stu-gutter-card").length).toBe(0);
  });

  describe("Insert > Hyperlink", () => {
    function selectDocumentText(): void {
      const root = documentSurface();
      root.innerHTML = "<p>Some selectable text.</p>";
      const textNode = root.querySelector("p")!.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, 5);
      range.setEnd(textNode, 15);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }

    it("does nothing and reports a status message when no text is selected", () => {
      require("../src/editor/main");
      const chrome = require("../src/studio/chrome");
      documentSurface().innerHTML = "<p>Nothing selected.</p>";
      document.getSelection()!.removeAllRanges();

      chrome.insertHyperlink();

      expect(document.getElementById("status")!.textContent).toContain("Select some text");
      expect(documentSurface().querySelector("a")).toBeNull();
    });

    it("wraps the selection in a hyperlink and preserves normal cursor navigation afterward", () => {
      require("../src/editor/main");
      const chrome = require("../src/studio/chrome");
      selectDocumentText();
      jest.spyOn(window, "prompt").mockReturnValue("https://example.com/exhibit-a");

      chrome.insertHyperlink();

      const link = documentSurface().querySelector("a");
      expect(link).not.toBeNull();
      expect(link!.href).toBe("https://example.com/exhibit-a");
      expect(link!.getAttribute("target")).toBe("_blank");
      expect(document.getElementById("status")!.textContent).toContain("Hyperlink added");

      // The selection should collapse to just after the new link, not be left spanning stale
      // (now-wrapped) nodes -- this is what keeps arrow-key/click navigation in the document
      // working normally afterward, rather than resuming from an invalid or surprising position.
      const selection = document.getSelection()!;
      expect(selection.isCollapsed).toBe(true);
      expect(documentSurface().contains(selection.anchorNode)).toBe(true);
    });

    it("rejects an unsafe URL scheme and leaves the document unchanged", () => {
      require("../src/editor/main");
      const chrome = require("../src/studio/chrome");
      selectDocumentText();
      jest.spyOn(window, "prompt").mockReturnValue("javascript:alert(1)");

      chrome.insertHyperlink();

      expect(documentSurface().querySelector("a")).toBeNull();
      expect(document.getElementById("status")!.textContent).toContain("doesn't look safe");
    });

    it("does nothing when the prompt is cancelled", () => {
      require("../src/editor/main");
      const chrome = require("../src/studio/chrome");
      selectDocumentText();
      jest.spyOn(window, "prompt").mockReturnValue(null);

      expect(() => chrome.insertHyperlink()).not.toThrow();
      expect(documentSurface().querySelector("a")).toBeNull();
    });
  });

  it("wires the Insert menu dropdown open and closed like the other menus", () => {
    require("../src/editor/main");
    require("../src/studio/chrome");

    const trigger = document.getElementById("stu-insert-menu-trigger")!;
    const menu = document.getElementById("stu-insert-menu")!;

    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(menu.classList.contains("open")).toBe(true);

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(menu.classList.contains("open")).toBe(false);
  });

  // scribe.js itself can't run in jsdom (WASM/workers/canvas), and its loader is injected as a
  // native-ES-module <script> that jsdom won't execute -- so these tests pre-seed
  // window.__openclerkScribe (what the loader would expose) and verify chrome.ts's wiring around
  // it: that Studio routes PDF import through scribe, and that the searchable-PDF export flow is
  // hooked up. The real engine is exercised in a browser (see the Playwright fixture gate).
  describe("scribe (OCR / searchable PDF)", () => {
    type ScribeMock = {
      extractPdfText: jest.Mock;
      exportSearchablePdf: jest.Mock;
      importPdfData: jest.Mock;
      convertPdfToDocx: jest.Mock;
    };

    function seedScribe(overrides: Partial<ScribeMock> = {}): ScribeMock {
      const scribe: ScribeMock = {
        extractPdfText: jest.fn().mockResolvedValue([{ pageNumber: 1, text: "recovered ocr text", source: "ocr" }]),
        exportSearchablePdf: jest.fn().mockResolvedValue(new ArrayBuffer(64)),
        importPdfData: jest.fn().mockResolvedValue({
          markdown: "# Heading\n\nBody text.",
          headings: [],
          stats: { pages: 1, words: 3, textNative: true, lowConfidenceWords: [] },
        }),
        convertPdfToDocx: jest.fn().mockResolvedValue(new ArrayBuffer(128)),
        ...overrides,
      };
      // Pre-seeding the global is what the injected loader would do; chrome.ts's ensureScribe()
      // then resolves to it immediately without injecting any <script>.
      (window as unknown as { __openclerkScribe?: ScribeMock }).__openclerkScribe = scribe;
      return scribe;
    }

    it("routes PDF import through scribe by pre-setting the __openclerkExtractPdfText seam", async () => {
      const scribe = seedScribe();
      require("../src/editor/main");
      require("../src/studio/chrome");

      const extractor = (window as unknown as { __openclerkExtractPdfText?: Function }).__openclerkExtractPdfText;
      expect(typeof extractor).toBe("function");

      const file = new File(["%PDF-1.4"], "scan.pdf", { type: "application/pdf" });
      const onProgress = jest.fn();
      const pages = await extractor!(file, { onProgress });

      expect(scribe.extractPdfText).toHaveBeenCalledWith(file, expect.objectContaining({ onProgress }));
      expect(pages[0].text).toBe("recovered ocr text");
      expect(pages[0].source).toBe("ocr");
    });

    it("clicking the File-menu item opens the searchable-PDF file picker", () => {
      require("../src/editor/main");
      require("../src/studio/chrome");

      const input = document.getElementById("stu-searchable-pdf-input") as HTMLInputElement;
      const clickSpy = jest.spyOn(input, "click").mockImplementation(() => {});
      document.getElementById("stu-save-searchable-pdf")!.click();
      expect(clickSpy).toHaveBeenCalled();
    });

    it("exports a searchable PDF and triggers a download when a file is picked", async () => {
      const scribe = seedScribe();
      const chrome = require("../src/studio/chrome");
      require("../src/editor/main");

      // jsdom implements neither URL.createObjectURL nor anchor-triggered downloads.
      const createObjectURL = jest.fn().mockReturnValue("blob:mock");
      const revokeObjectURL = jest.fn();
      (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
      (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
      const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      const input = document.getElementById("stu-searchable-pdf-input") as HTMLInputElement;
      const file = new File(["%PDF-1.4"], "brief.pdf", { type: "application/pdf" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });

      await chrome.handleSearchablePdfExport({ target: input } as unknown as Event);

      expect(scribe.exportSearchablePdf).toHaveBeenCalledWith(file, expect.objectContaining({ onProgress: expect.any(Function) }));
      expect(createObjectURL).toHaveBeenCalled();
      expect(anchorClick).toHaveBeenCalled();
      expect(document.getElementById("status")!.textContent).toContain("brief-searchable.pdf");
    });

    it("surfaces an error status if the searchable-PDF export fails", async () => {
      seedScribe({ exportSearchablePdf: jest.fn().mockRejectedValue(new Error("OCR blew up")) });
      const chrome = require("../src/studio/chrome");
      require("../src/editor/main");

      const input = document.getElementById("stu-searchable-pdf-input") as HTMLInputElement;
      Object.defineProperty(input, "files", {
        value: [new File(["x"], "brief.pdf", { type: "application/pdf" })],
        configurable: true,
      });

      await chrome.handleSearchablePdfExport({ target: input } as unknown as Event);
      expect(document.getElementById("status")!.textContent).toContain("OCR blew up");
    });

    it("imports a PDF's Markdown as formatted document HTML and reports stats", async () => {
      seedScribe({
        importPdfData: jest.fn().mockResolvedValue({
          markdown: "**Damages Summary**\n\n| Category | Amount |\n| --- | --- |\n| Medical | $12,500 |",
          headings: [],
          stats: { pages: 2, words: 40, textNative: false, lowConfidenceWords: [] },
        }),
      });
      const chrome = require("../src/studio/chrome");
      require("../src/editor/main");

      const input = document.getElementById("stu-import-pdf-input") as HTMLInputElement;
      Object.defineProperty(input, "files", {
        value: [new File(["x"], "filing.pdf", { type: "application/pdf" })],
        configurable: true,
      });

      await chrome.handlePdfImport({ target: input } as unknown as Event);

      const surface = documentSurface();
      // No heading was detected for this bold line, so it stays a bold paragraph, not an <hN>.
      expect(surface.querySelector("b")!.textContent).toBe("Damages Summary");
      expect(surface.querySelector("h1, h2, h3")).toBeNull();
      expect(surface.querySelector("table.oc-import-table")).not.toBeNull();
      expect(surface.querySelector("td")!.textContent).toBe("Medical");
      expect(document.getElementById("status")!.textContent).toMatch(/Imported "filing\.pdf" \(2 page\(s\), 40 words, via OCR\)/);
    });

    it("renders detected headings as <hN>, feeds the outline, and notes the count", async () => {
      seedScribe({
        importPdfData: jest.fn().mockResolvedValue({
          markdown: "**Memorandum of Law**\n\nIntro paragraph.\n\n**Statement of Facts**\n\nThe facts.",
          headings: [
            { text: "Memorandum of Law", level: 1 },
            { text: "Statement of Facts", level: 2 },
          ],
          stats: { pages: 1, words: 12, textNative: true, lowConfidenceWords: [] },
        }),
      });
      const chrome = require("../src/studio/chrome");
      require("../src/editor/main");

      const input = document.getElementById("stu-import-pdf-input") as HTMLInputElement;
      Object.defineProperty(input, "files", {
        value: [new File(["x"], "memo.pdf", { type: "application/pdf" })],
        configurable: true,
      });

      await chrome.handlePdfImport({ target: input } as unknown as Event);

      const surface = documentSurface();
      expect(surface.querySelector("h1")!.textContent).toBe("Memorandum of Law");
      expect(surface.querySelector("h2")!.textContent).toBe("Statement of Facts");
      // The bold-line headings became real <hN>, not bold paragraphs.
      expect(surface.querySelector("b")).toBeNull();
      // The detected headings flow into the document outline.
      const outline = Array.from(document.querySelectorAll(".stu-outline-item")).map((el) => el.textContent);
      expect(outline).toEqual(["Memorandum of Law", "Statement of Facts"]);
      expect(document.getElementById("status")!.textContent).toContain("2 heading(s) detected");
    });

    it("highlights low-confidence words reported by the import", async () => {
      seedScribe({
        importPdfData: jest.fn().mockResolvedValue({
          markdown: "The AVIANCA appeal and the Affirma statement.",
          headings: [],
          stats: { pages: 1, words: 7, textNative: false, lowConfidenceWords: ["AVIANCA", "Affirma"] },
        }),
      });
      const chrome = require("../src/studio/chrome");
      require("../src/editor/main");

      const input = document.getElementById("stu-import-pdf-input") as HTMLInputElement;
      Object.defineProperty(input, "files", { value: [new File(["x"], "s.pdf")], configurable: true });

      await chrome.handlePdfImport({ target: input } as unknown as Event);

      const marks = Array.from(documentSurface().querySelectorAll("mark.oc-lowconf")).map((m) => m.textContent);
      expect(marks).toEqual(["AVIANCA", "Affirma"]);
      expect(document.getElementById("status")!.textContent).toContain("2 low-confidence word(s)");
    });

    it("converts a PDF to Word (.docx) and triggers a download", async () => {
      const scribe = seedScribe();
      const chrome = require("../src/studio/chrome");
      require("../src/editor/main");

      (URL as unknown as { createObjectURL: unknown }).createObjectURL = jest.fn().mockReturnValue("blob:mock");
      (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = jest.fn();
      const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      const input = document.getElementById("stu-pdf-to-docx-input") as HTMLInputElement;
      const file = new File(["x"], "brief.pdf", { type: "application/pdf" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });

      await chrome.handlePdfToDocx({ target: input } as unknown as Event);

      expect(scribe.convertPdfToDocx).toHaveBeenCalledWith(file, expect.objectContaining({ onProgress: expect.any(Function) }));
      expect(anchorClick).toHaveBeenCalled();
      expect(document.getElementById("status")!.textContent).toContain("brief.docx");
    });
  });

  describe("markdownToHtml (scribe import rendering)", () => {
    it("renders headings, bold, and italic", () => {
      const { markdownToHtml } = require("../src/studio/chrome");
      const html = markdownToHtml("## Section\n\nSome **bold** and *italic* text.");
      expect(html).toContain("<h2>Section</h2>");
      expect(html).toContain("<b>bold</b>");
      expect(html).toContain("<i>italic</i>");
    });

    it("renders a Markdown table as a real <table> with header and body rows", () => {
      const { markdownToHtml } = require("../src/studio/chrome");
      const html = markdownToHtml("| A | B |\n| --- | --- |\n| 1 | 2 |");
      expect(html).toContain('<table class="oc-import-table">');
      expect(html).toContain("<th>A</th>");
      expect(html).toContain("<td>1</td>");
    });

    it("keeps a legal-style numbered line as a paragraph, not an ordered list", () => {
      const { markdownToHtml } = require("../src/studio/chrome");
      const html = markdownToHtml("1. I am an attorney of record.");
      expect(html).toContain("<p>1. I am an attorney of record.</p>");
      expect(html).not.toContain("<ol>");
    });

    it("escapes HTML in the source text", () => {
      const { markdownToHtml } = require("../src/studio/chrome");
      expect(markdownToHtml("a < b & c > d")).toContain("a &lt; b &amp; c &gt; d");
    });

    it("promotes a bold line to <hN> when it matches a detected heading", () => {
      const { markdownToHtml } = require("../src/studio/chrome");
      const html = markdownToHtml(
        "**Memorandum of Law**\n\n**Statement of Facts**\n\nBody.",
        [
          { text: "Memorandum of Law", level: 1 },
          { text: "Statement of Facts", level: 2 },
        ],
      );
      expect(html).toContain("<h1>Memorandum of Law</h1>");
      expect(html).toContain("<h2>Statement of Facts</h2>");
      expect(html).toContain("<p>Body.</p>");
      expect(html).not.toContain("<b>");
    });

    it("leaves a bold line as a bold paragraph when it is not a detected heading", () => {
      const { markdownToHtml } = require("../src/studio/chrome");
      const html = markdownToHtml("**Not a heading**", [{ text: "Statement of Facts", level: 2 }]);
      expect(html).toContain("<p><b>Not a heading</b></p>");
      expect(html).not.toContain("<h");
    });

    it("clamps a detected heading level into the h1-h3 range", () => {
      const { markdownToHtml } = require("../src/studio/chrome");
      const html = markdownToHtml("**Deep Heading**", [{ text: "Deep Heading", level: 7 }]);
      expect(html).toContain("<h3>Deep Heading</h3>");
    });
  });

  describe("highlightLowConfidence", () => {
    it("does not mark a token that only appears inside a larger word", () => {
      const { highlightLowConfidence } = require("../src/studio/chrome");
      const root = document.createElement("div");
      root.innerHTML = "<p>The AVIANCA airline</p>"; // token "AVIAN" is a substring of AVIANCA
      highlightLowConfidence(root, ["AVIAN"]);
      expect(root.querySelectorAll("mark.oc-lowconf").length).toBe(0);
    });

    it("marks a standalone occurrence of a low-confidence token", () => {
      const { highlightLowConfidence } = require("../src/studio/chrome");
      const root = document.createElement("div");
      root.innerHTML = "<p>The Affirma was filed.</p>";
      highlightLowConfidence(root, ["Affirma"]);
      const marks = root.querySelectorAll("mark.oc-lowconf");
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe("Affirma");
    });
  });

  describe("Edit menu", () => {
    it("Undo / Redo forward to the formatting-toolbar buttons", () => {
      require("../src/editor/main");
      require("../src/studio/chrome");

      const undoSpy = jest.spyOn(document.getElementById("format-undo-button") as HTMLElement, "click");
      const redoSpy = jest.spyOn(document.getElementById("format-redo-button") as HTMLElement, "click");

      document.getElementById("stu-edit-undo")!.click();
      document.getElementById("stu-edit-redo")!.click();

      expect(undoSpy).toHaveBeenCalledTimes(1);
      expect(redoSpy).toHaveBeenCalledTimes(1);
    });

    it("Select all selects the whole document surface", () => {
      require("../src/editor/main");
      require("../src/studio/chrome");
      documentSurface().innerHTML = "<p>First line.</p><p>Second line.</p>";

      document.getElementById("stu-edit-select-all")!.click();

      const selection = document.getSelection()!;
      expect(selection.rangeCount).toBe(1);
      expect(selection.toString()).toContain("First line.");
      expect(selection.toString()).toContain("Second line.");
    });
  });

  describe("View menu", () => {
    it("toggles the document outline's visibility and its checkmark", () => {
      require("../src/editor/main");
      require("../src/studio/chrome");
      const outline = document.getElementById("stu-outline")!;
      const button = document.getElementById("stu-view-toggle-outline")!;
      const check = button.querySelector("[data-check]")!;

      expect(outline.classList.contains("stu-hidden")).toBe(false);

      button.click();
      expect(outline.classList.contains("stu-hidden")).toBe(true);
      expect(button.getAttribute("aria-checked")).toBe("false");
      expect(check.textContent).toBe("");

      button.click();
      expect(outline.classList.contains("stu-hidden")).toBe(false);
      expect(button.getAttribute("aria-checked")).toBe("true");
      expect(check.textContent).toBe("✓");
    });

    it("toggles the comment gutter's visibility", () => {
      require("../src/editor/main");
      require("../src/studio/chrome");
      const gutter = document.getElementById("stu-gutter")!;
      const button = document.getElementById("stu-view-toggle-gutter")!;

      button.click();
      expect(gutter.classList.contains("stu-hidden")).toBe(true);
      button.click();
      expect(gutter.classList.contains("stu-hidden")).toBe(false);
    });
  });
});
