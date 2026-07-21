// examples/main.ts is pure documentation chrome -- no citation-checking logic -- so this only
// covers the footer version text and the "Copy" button behavior.

function setUpDom(): void {
  document.body.innerHTML = `
    <span id="core-version"></span>
    <pre id="example-citations">Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009)</pre>
    <button type="button" data-copy-target="example-citations">Copy</button>
  `;
}

describe("openclerk-web examples page", () => {
  beforeEach(() => {
    jest.resetModules();
    setUpDom();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("shows the openclerk-core version in the footer", () => {
    require("../src/examples/main");
    expect(document.getElementById("core-version")!.textContent).toMatch(/^ v/);
  });

  it("copies the target block's text to the clipboard when Copy is clicked", async () => {
    require("../src/examples/main");
    const button = document.querySelector<HTMLButtonElement>("[data-copy-target]")!;

    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009)",
    );
  });

  it("falls back to a helpful message if the clipboard write fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    require("../src/examples/main");
    const button = document.querySelector<HTMLButtonElement>("[data-copy-target]")!;

    button.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(button.textContent).toMatch(/select the text manually/i);
  });
});
