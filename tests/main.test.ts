// main.ts wires DOM elements up as soon as it's imported (readyState check at module scope), so
// the required markup must exist in the document *before* each require() -- and each test needs
// a fresh module instance (jest.resetModules()) so that top-level wiring re-runs against the
// freshly-reset DOM rather than stale element references from a previous test's markup.

function setUpDom(): void {
  document.body.innerHTML = `
    <select id="edition-select"></select>
    <p id="edition-description"></p>
    <textarea id="citation-input"></textarea>
    <button id="check-button"></button>
    <p id="status"></p>
    <div id="results"></div>
  `;
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
});
