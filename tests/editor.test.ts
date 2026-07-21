import JSZip from "jszip";

// editor/main.ts wires DOM elements up as soon as it's imported (same readyState-check-at-module-
// scope pattern as main.ts), so the required markup must exist before each require() -- and each
// test needs a fresh module graph (jest.resetModules()) so openclerk-core's citationProviderRegistry
// (a module-level singleton) doesn't leak provider auth state between tests.

function setUpDom(): void {
  document.body.innerHTML = `
    <input type="file" id="load-file-input" />
    <p id="load-file-status"></p>
    <button type="button" id="clear-document-button"></button>
    <button type="button" id="download-txt-button"></button>
    <button type="button" id="download-odt-button"></button>
    <div class="formatting-toolbar">
      <select id="format-block-select">
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
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
    <div id="document-surface" contenteditable="true"><p>Placeholder.</p></div>

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

    <p id="status"></p>
  `;
}

function documentSurface(): HTMLElement {
  return document.getElementById("document-surface") as HTMLElement;
}

function setDocText(text: string): void {
  const root = documentSurface();
  root.innerHTML = "";
  text.split("\n").forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    root.appendChild(p);
  });
}

function selectFile(inputId: string, file: File): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
}

async function buildDocx(paragraphs: string[]): Promise<File> {
  const zip = new JSZip();
  const body = paragraphs.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  const arrayBuffer = await zip.generateAsync({ type: "arraybuffer" });
  return new File([arrayBuffer], "brief.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

async function buildOdt(paragraphs: string[]): Promise<File> {
  const zip = new JSZip();
  const body = paragraphs.map((text) => `<text:p>${text}</text:p>`).join("");
  zip.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });
  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text>${body}</office:text></office:body></office:document-content>`,
  );
  const arrayBuffer = await zip.generateAsync({ type: "arraybuffer" });
  return new File([arrayBuffer], "brief.odt", { type: "application/vnd.oasis.opendocument.text" });
}

const CITATION = "Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)";

// Fakes CourtListener's two endpoints (citation-lookup and opinions) well enough to exercise the
// Online Lookup / Find Hallucinations / Embed Cited Text workflows without a real network call.
function installCourtListenerFetchMock(
  options: { found?: boolean; opinionText?: string } = {},
): jest.Mock {
  const found = options.found ?? true;
  const fetchMock = jest.fn(async (url: string) => {
    if (url.includes("/citation-lookup/")) {
      const body = found
        ? [
            {
              status: 200,
              citation: CITATION,
              clusters: [
                {
                  case_name: "Norfolk & W. Ry. Co. v. Liepelt",
                  absolute_url: "/opinion/12345/norfolk/",
                },
              ],
            },
          ]
        : [{ status: 404, clusters: [] }];
      return { ok: true, status: 200, json: async () => body } as Response;
    }
    if (url.includes("/opinions/")) {
      const body = { results: [{ plain_text: options.opinionText || "" }] };
      return { ok: true, status: 200, json: async () => body } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("openclerk-web editor", () => {
  beforeEach(() => {
    jest.resetModules();
    setUpDom();
  });

  afterEach(() => {
    (window as unknown as { __openclerkExtractPdfText?: unknown }).__openclerkExtractPdfText =
      undefined;
  });

  it("loads a .txt file's contents into the document surface", async () => {
    const editor = require("../src/editor/main");
    const file = new File([CITATION], "brief.txt", { type: "text/plain" });
    selectFile("load-file-input", file);

    await editor.handleDocumentFileUpload();

    expect(documentSurface().textContent).toContain(CITATION);
    expect(document.getElementById("load-file-status")!.textContent).toMatch(/Loaded "brief\.txt"/);
  });

  it("extracts text from a .docx file's body into the document surface", async () => {
    const editor = require("../src/editor/main");
    const file = await buildDocx([
      "Norfolk &amp; W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)",
    ]);
    selectFile("load-file-input", file);

    await editor.handleDocumentFileUpload();

    expect(documentSurface().textContent).toContain(CITATION);
  });

  it("extracts text from a .odt file's body into the document surface", async () => {
    const editor = require("../src/editor/main");
    const file = await buildOdt([
      "Norfolk &amp; W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)",
    ]);
    selectFile("load-file-input", file);

    await editor.handleDocumentFileUpload();

    expect(documentSurface().textContent).toContain(CITATION);
  });

  it("loads extracted text from a .pdf via the lazily-loaded PDF extractor", async () => {
    const editor = require("../src/editor/main");

    // Simulates editor-pdf-bundle.js already having loaded and registered itself -- the actual
    // <script> injection and pdf.js/tesseract.js extraction aren't exercised here (jsdom has no
    // real <canvas>/Worker/WASM support to run them; see pdf.test.ts for the same tradeoff on the
    // PDF page), just that main.ts correctly calls the global and populates the document from its
    // result.
    const mockExtractPdfText = jest.fn(async () => [
      { pageNumber: 1, text: CITATION, source: "embedded" as const },
      { pageNumber: 2, text: "Second page, via OCR.", source: "ocr" as const },
    ]);
    (
      window as unknown as { __openclerkExtractPdfText: typeof mockExtractPdfText }
    ).__openclerkExtractPdfText = mockExtractPdfText;

    const file = new File(["%PDF-1.4 fake content"], "brief.pdf", { type: "application/pdf" });
    selectFile("load-file-input", file);

    await editor.handleDocumentFileUpload();

    expect(mockExtractPdfText).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
    expect(documentSurface().textContent).toContain(CITATION);
    expect(documentSurface().textContent).toContain("Second page, via OCR.");
    expect(document.getElementById("load-file-status")!.textContent).toMatch(
      /Loaded "brief\.pdf" \(2 page\(s\), 1 via OCR\)/,
    );
  });

  it("reports an error if PDF scanning support can't be loaded", async () => {
    const editor = require("../src/editor/main");
    // No window.__openclerkExtractPdfText set, and no script will actually load in jsdom, so
    // loadPdfExtractor's script-injection path runs and its onload/onerror never fire -- instead
    // of hanging, simulate the script failing to load (e.g. offline, blocked) via its error path.
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === "script") {
        queueMicrotask(() => el.dispatchEvent(new Event("error")));
      }
      return el;
    });

    const file = new File(["%PDF-1.4 fake content"], "brief.pdf", { type: "application/pdf" });
    selectFile("load-file-input", file);

    await editor.handleDocumentFileUpload();

    expect(document.getElementById("load-file-status")!.textContent).toMatch(/Failed to load/);
    (document.createElement as jest.Mock).mockRestore();
  });

  it("clears the document", () => {
    const editor = require("../src/editor/main");
    setDocText(CITATION);

    editor.clearDocument();

    expect(documentSurface().textContent.trim()).toBe("");
  });

  it("switches the visible workflow panel when the dropdown changes", () => {
    require("../src/editor/main");
    const select = document.getElementById("workflow-select") as HTMLSelectElement;

    select.value = "bluebook-check";
    select.dispatchEvent(new Event("change"));

    expect(document.getElementById("bluebook-check-panel")!.classList.contains("active")).toBe(
      true,
    );
    expect(document.getElementById("manage-hyperlinks-panel")!.classList.contains("active")).toBe(
      false,
    );
  });

  it("runs a Bluebook check against the document and renders a result", async () => {
    const editor = require("../src/editor/main");
    setDocText(CITATION);

    await editor.checkBluebookCitations();

    const results = document.getElementById("bluebook-issue-list")!;
    expect(results.children.length).toBe(1);
    expect(results.textContent).toContain("Norfolk & W. Ry. Co. v. Liepelt");
    expect(document.getElementById("status")!.textContent).toMatch(/Checked 1 citation/);
  });

  it("flashes the matched citation in the document when jumping to it", async () => {
    const editor = require("../src/editor/main");
    setDocText(CITATION);
    await editor.checkBluebookCitations();

    editor.goToCitationInDocument(CITATION);

    expect(documentSurface().querySelector("mark.oc-flash")).not.toBeNull();
    expect(document.getElementById("status")!.textContent).toMatch(/Jumped to/);
  });

  it("scans for parenthetical citations and adds/removes a hyperlink", async () => {
    const editor = require("../src/editor/main");
    setDocText("See the discussion (Restatement (Second) of Torts).");

    await editor.scanParentheticalCitations();
    const list = document.getElementById("parenthetical-citation-list")!;
    expect(list.querySelectorAll("input.url-input, input[type=text]").length).toBeGreaterThan(0);

    const urlInput = list.querySelector("input") as HTMLInputElement;
    urlInput.value = "https://example.com/restatement";
    urlInput.dispatchEvent(new Event("input"));

    await editor.addParentheticalHyperlinks();
    const link = documentSurface().querySelector(
      "a.oc-parenthetical-hyperlink",
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.href).toBe("https://example.com/restatement");

    await editor.removeParentheticalHyperlinks();
    expect(documentSurface().querySelector("a.oc-parenthetical-hyperlink")).toBeNull();
  });

  it("applies and removes a case-law hyperlink via a connected online-lookup provider", async () => {
    installCourtListenerFetchMock({ found: true });
    const editor = require("../src/editor/main");
    setDocText(CITATION);

    const providerSelect = document.getElementById("provider-select") as HTMLSelectElement;
    providerSelect.value = "courtlistener";
    providerSelect.dispatchEvent(new Event("change"));

    const tokenInput = document.getElementById(
      "credential-courtlistener-apiToken",
    ) as HTMLInputElement;
    tokenInput.value = "test-token";
    await editor.connectSelectedProvider();
    expect(document.getElementById("provider-auth-status")!.textContent).toBe("Connected.");

    await editor.applyHyperlinksViaProvider();
    const link = documentSurface().querySelector("a.oc-case-hyperlink") as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.href).toContain("/opinion/12345/norfolk/");

    await editor.removeCaseLawHyperlinks();
    expect(documentSurface().querySelector("a.oc-case-hyperlink")).toBeNull();
  });

  it("embeds cited opinion text and toggles the excerpt on click", async () => {
    installCourtListenerFetchMock({
      found: true,
      opinionText: "Page 490. Some opinion text. *496 More text on the pincite page.",
    });
    const editor = require("../src/editor/main");
    setDocText("Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490, 496 (U.S.Ill., 1980)");

    const providerSelect = document.getElementById("provider-select") as HTMLSelectElement;
    providerSelect.value = "courtlistener";
    providerSelect.dispatchEvent(new Event("change"));
    const tokenInput = document.getElementById(
      "credential-courtlistener-apiToken",
    ) as HTMLInputElement;
    tokenInput.value = "test-token";
    await editor.connectSelectedProvider();

    const embedSelect = document.getElementById("embed-text-provider-select") as HTMLSelectElement;
    embedSelect.value = "courtlistener";
    embedSelect.dispatchEvent(new Event("change"));

    await editor.embedCitedOpinionText();
    const note = documentSurface().querySelector("mark.oc-embed-note") as HTMLElement | null;
    expect(note).not.toBeNull();
    expect(documentSurface().querySelector(".oc-embed-excerpt")).toBeNull();

    note!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(documentSurface().querySelector(".oc-embed-excerpt")).not.toBeNull();

    await editor.removeEmbeddedCitationText();
    expect(documentSurface().querySelector("mark.oc-embed-note")).toBeNull();
    expect(documentSurface().querySelector(".oc-embed-excerpt")).toBeNull();
  });

  it("exports the document as plain text", () => {
    require("../src/editor/main");
    const { buildPlainTextExport } = require("../src/editor/exportDocument");
    setDocText(`${CITATION}\nSecond paragraph.`);

    const text = buildPlainTextExport(documentSurface());

    expect(text).toBe(`${CITATION}\nSecond paragraph.`);
  });

  it("exports the document as a valid .odt archive with an applied hyperlink preserved", async () => {
    installCourtListenerFetchMock({ found: true });
    const editor = require("../src/editor/main");
    const { buildOdtArchive } = require("../src/editor/exportDocument");
    setDocText(CITATION);

    const providerSelect = document.getElementById("provider-select") as HTMLSelectElement;
    providerSelect.value = "courtlistener";
    providerSelect.dispatchEvent(new Event("change"));
    const tokenInput = document.getElementById(
      "credential-courtlistener-apiToken",
    ) as HTMLInputElement;
    tokenInput.value = "test-token";
    await editor.connectSelectedProvider();
    await editor.applyHyperlinksViaProvider();

    const archive: ArrayBuffer = await buildOdtArchive(documentSurface());
    const zip = await JSZip.loadAsync(archive);

    expect(zip.file("mimetype")).not.toBeNull();
    expect(zip.file("META-INF/manifest.xml")).not.toBeNull();

    const contentXml = await zip.file("content.xml")!.async("string");
    expect(contentXml).toContain("<text:a");
    expect(contentXml).toContain("/opinion/12345/norfolk/");
    expect(contentXml).toContain("Norfolk");
  });

  it("exports headings, lists, and bold/italic/underline formatting in the .odt archive", async () => {
    require("../src/editor/main");
    const { buildOdtArchive } = require("../src/editor/exportDocument");

    // Built directly rather than via the formatting toolbar's execCommand calls (not implemented
    // in jsdom -- see formatting.ts) -- this exercises the export serializer deterministically,
    // independent of whether the browser's own execCommand happened to produce <b> vs <strong>.
    documentSurface().innerHTML =
      "<h1>Case Summary</h1>" +
      "<p>This case involves <strong>bold</strong>, <em>italic</em>, and <u>underlined</u> text.</p>" +
      "<ul><li>First point</li><li>Second point</li></ul>" +
      "<ol><li>Step one</li><li>Step two</li></ol>";

    const archive: ArrayBuffer = await buildOdtArchive(documentSurface());
    const zip = await JSZip.loadAsync(archive);
    const contentXml = await zip.file("content.xml")!.async("string");

    expect(contentXml).toContain('<text:h text:outline-level="1">Case Summary</text:h>');
    expect(contentXml).toContain('<text:span text:style-name="Bold">bold</text:span>');
    expect(contentXml).toContain('<text:span text:style-name="Italic">italic</text:span>');
    expect(contentXml).toContain('<text:span text:style-name="Underline">underlined</text:span>');
    expect(contentXml).toContain("<text:list-item><text:p>First point</text:p></text:list-item>");
    expect(contentXml).toContain('<text:list text:style-name="OrderedList">');
    expect(contentXml).toContain("<text:list-item><text:p>Step one</text:p></text:list-item>");
  });

  it("exports a manually-inserted hyperlink (Studio's Insert menu) as a real <text:a> in the .odt archive", async () => {
    require("../src/editor/main");
    const { buildOdtArchive } = require("../src/editor/exportDocument");
    const { MANUAL_HYPERLINK_CLASS } = require("../src/editor/markers");

    documentSurface().innerHTML = `<p>See <a class="${MANUAL_HYPERLINK_CLASS}" href="https://example.com/exhibit-a">Exhibit A</a> for details.</p>`;

    const archive: ArrayBuffer = await buildOdtArchive(documentSurface());
    const zip = await JSZip.loadAsync(archive);
    const contentXml = await zip.file("content.xml")!.async("string");

    expect(contentXml).toContain(
      '<text:a xlink:type="simple" xlink:href="https://example.com/exhibit-a">Exhibit A</text:a>',
    );
  });

  it("wires up the formatting toolbar without throwing, even though execCommand isn't available in jsdom", () => {
    require("../src/editor/main");

    expect(() => {
      document.getElementById("format-bold-button")!.dispatchEvent(new Event("click"));
      document.getElementById("format-italic-button")!.dispatchEvent(new Event("click"));
      document.getElementById("format-underline-button")!.dispatchEvent(new Event("click"));
      document.getElementById("format-bullet-list-button")!.dispatchEvent(new Event("click"));
      document.getElementById("format-numbered-list-button")!.dispatchEvent(new Event("click"));
      document.getElementById("format-align-left-button")!.dispatchEvent(new Event("click"));
      document.getElementById("format-align-justify-button")!.dispatchEvent(new Event("click"));
      document.getElementById("format-undo-button")!.dispatchEvent(new Event("click"));
      document.getElementById("format-redo-button")!.dispatchEvent(new Event("click"));

      const blockSelect = document.getElementById("format-block-select") as HTMLSelectElement;
      blockSelect.value = "h1";
      blockSelect.dispatchEvent(new Event("change"));

      documentSurface().dispatchEvent(
        new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true }),
      );
    }).not.toThrow();
  });
});
