import JSZip from "jszip";

// main.ts wires DOM elements up as soon as it's imported (readyState check at module scope), so
// the required markup must exist in the document *before* each require() -- and each test needs
// a fresh module instance (jest.resetModules()) so that top-level wiring re-runs against the
// freshly-reset DOM rather than stale element references from a previous test's markup.

function setUpDom(): void {
  document.body.innerHTML = `
    <select id="edition-select"></select>
    <p id="edition-description"></p>
    <textarea id="citation-input"></textarea>
    <input type="file" id="file-input" />
    <p id="file-status"></p>
    <button id="check-button"></button>
    <p id="status"></p>
    <div id="results"></div>
  `;
}

// jsdom's <input type="file">.files is read-only in normal use, but defineProperty is the
// standard way to simulate a user's file selection in tests.
function selectFile(file: File): void {
  const input = document.getElementById("file-input") as HTMLInputElement;
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

describe("openclerk-web main", () => {
  beforeEach(() => {
    jest.resetModules();
    setUpDom();
  });

  it("populates the edition dropdown with all three Bluebook editions on load", () => {
    require("../src/main");
    const select = document.getElementById("edition-select") as HTMLSelectElement;
    expect(select.options.length).toBe(3);
    expect(document.getElementById("edition-description")!.textContent).not.toBe("");
  });

  it("updates the edition description when the selection changes", () => {
    require("../src/main");
    const select = document.getElementById("edition-select") as HTMLSelectElement;
    const firstDescription = document.getElementById("edition-description")!.textContent;

    select.value = select.options[select.options.length - 1].value;
    select.dispatchEvent(new Event("change"));

    expect(document.getElementById("edition-description")!.textContent).not.toBe(firstDescription);
  });

  it("reports when no citations are found in the pasted text", () => {
    require("../src/main");
    const textarea = document.getElementById("citation-input") as HTMLTextAreaElement;
    textarea.value = "This paragraph has no case citations in it at all.";

    document.getElementById("check-button")!.dispatchEvent(new Event("click"));

    expect(document.getElementById("status")!.textContent).toMatch(/no case citations/i);
    expect(document.getElementById("results")!.children.length).toBe(0);
  });

  it("finds a pasted citation and renders one result for it", () => {
    require("../src/main");
    const textarea = document.getElementById("citation-input") as HTMLTextAreaElement;
    textarea.value = "Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)";

    document.getElementById("check-button")!.dispatchEvent(new Event("click"));

    const results = document.getElementById("results")!;
    expect(results.children.length).toBe(1);
    expect(results.textContent).toContain("Norfolk & W. Ry. Co. v. Liepelt");
    expect(document.getElementById("status")!.textContent).toMatch(/Checked 1 citation/);
  });

  it("loads a .txt file's contents into the textarea", async () => {
    const main = require("../src/main");
    const file = new File(
      ["Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)"],
      "brief.txt",
      { type: "text/plain" },
    );
    selectFile(file);

    await main.handleFileUpload();

    const textarea = document.getElementById("citation-input") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)");
    expect(document.getElementById("file-status")!.textContent).toMatch(/Loaded "brief\.txt"/);
  });

  it("extracts text from a .docx file's body into the textarea", async () => {
    const main = require("../src/main");
    const file = await buildDocx([
      "Norfolk &amp; W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)",
      "Second paragraph.",
    ]);
    selectFile(file);

    await main.handleFileUpload();

    const textarea = document.getElementById("citation-input") as HTMLTextAreaElement;
    expect(textarea.value).toBe(
      "Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)\nSecond paragraph.",
    );
    expect(document.getElementById("file-status")!.textContent).toMatch(/Loaded "brief\.docx"/);
  });

  it("extracts text from a .odt file's body into the textarea", async () => {
    const main = require("../src/main");
    const file = await buildOdt([
      "Norfolk &amp; W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)",
      "Second paragraph.",
    ]);
    selectFile(file);

    await main.handleFileUpload();

    const textarea = document.getElementById("citation-input") as HTMLTextAreaElement;
    expect(textarea.value).toBe(
      "Norfolk & W. Ry. Co. v. Liepelt, 444 U.S. 490 (U.S.Ill., 1980)\nSecond paragraph.",
    );
    expect(document.getElementById("file-status")!.textContent).toMatch(/Loaded "brief\.odt"/);
  });

  it("rejects an unsupported file type without touching the textarea", async () => {
    const main = require("../src/main");
    const textarea = document.getElementById("citation-input") as HTMLTextAreaElement;
    textarea.value = "unchanged";
    const file = new File(["%PDF-1.4"], "brief.pdf", { type: "application/pdf" });
    selectFile(file);

    await main.handleFileUpload();

    expect(textarea.value).toBe("unchanged");
    expect(document.getElementById("file-status")!.textContent).toMatch(/Unsupported file type/);
  });
});
