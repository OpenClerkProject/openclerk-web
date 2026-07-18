// This page is pure documentation -- no citation-checking logic, no file handling -- so its
// bundle only needs to do what every other page's init() does for the footer, plus wire up the
// "Copy" buttons next to the example code blocks.

function copyText(text: string, button: HTMLButtonElement): void {
  const originalLabel = button.textContent;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      button.textContent = "Copied!";
    })
    .catch(() => {
      button.textContent = "Could not copy -- select the text manually.";
    })
    .finally(() => {
      window.setTimeout(() => {
        button.textContent = originalLabel;
      }, 1500);
    });
}

function init(): void {
  const coreVersionEl = document.getElementById("core-version");
  if (coreVersionEl) {
    coreVersionEl.textContent = ` v${__OPENCLERK_CORE_VERSION__}`;
  }

  document.querySelectorAll<HTMLButtonElement>("[data-copy-target]").forEach((button) => {
    const targetId = button.getAttribute("data-copy-target");
    const target = targetId ? document.getElementById(targetId) : null;
    if (!target) {
      return;
    }
    button.addEventListener("click", () => copyText(target.textContent || "", button));
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { init };
