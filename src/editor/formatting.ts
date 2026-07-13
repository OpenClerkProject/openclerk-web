// A small Word/Docs-style formatting toolbar for the document surface: bold/italic/underline,
// paragraph style (Normal/Heading 1-3), bullet/numbered lists, and undo/redo.
//
// Built on `document.execCommand`, which the HTML spec marks obsolete -- there's still no
// standardized replacement for "toggle bold on the current selection in a contenteditable region"
// as of 2026, and every evergreen browser continues to implement it. Writing a from-scratch
// selection-aware bold/italic toggle (splitting partially-formatted selections, merging adjacent
// identical marks, etc.) is exactly the problem real editor frameworks like ProseMirror/Tiptap
// exist to solve -- reimplementing a slice of that by hand here would trade one set of rough edges
// for another, so this leans on the browser's own implementation instead.
const FORMAT_BLOCK_TAGS = ["p", "h1", "h2", "h3"] as const;
type FormatBlockTag = (typeof FORMAT_BLOCK_TAGS)[number];

// document.execCommand/queryCommandState/queryCommandValue aren't implemented at all in jsdom
// (this project's test environment) -- guarding every call, rather than only where tests happen
// to reach, means a real environment lacking them (or a future browser that finally drops the
// obsolete API) degrades to a no-op toolbar instead of throwing.
function hasExecCommand(): boolean {
  return typeof document.execCommand === "function";
}

function exec(command: string, value?: string): void {
  if (hasExecCommand()) {
    document.execCommand(command, false, value);
  }
}

function isSelectionInside(root: HTMLElement): boolean {
  const selection = document.getSelection();
  const anchorNode = selection?.anchorNode;
  return Boolean(anchorNode && root.contains(anchorNode));
}

function normalizeFormatBlockValue(value: string): FormatBlockTag {
  const tag = value.replace(/[<>]/g, "").toLowerCase();
  return (FORMAT_BLOCK_TAGS as readonly string[]).includes(tag) ? (tag as FormatBlockTag) : "p";
}

function updateToolbarState(root: HTMLElement): void {
  if (!hasExecCommand() || !isSelectionInside(root)) {
    return;
  }

  const boldButton = document.getElementById("format-bold-button");
  const italicButton = document.getElementById("format-italic-button");
  const underlineButton = document.getElementById("format-underline-button");
  const bulletButton = document.getElementById("format-bullet-list-button");
  const numberedButton = document.getElementById("format-numbered-list-button");
  const blockSelect = document.getElementById("format-block-select") as HTMLSelectElement | null;

  boldButton?.classList.toggle("active", document.queryCommandState("bold"));
  italicButton?.classList.toggle("active", document.queryCommandState("italic"));
  underlineButton?.classList.toggle("active", document.queryCommandState("underline"));
  bulletButton?.classList.toggle("active", document.queryCommandState("insertUnorderedList"));
  numberedButton?.classList.toggle("active", document.queryCommandState("insertOrderedList"));

  if (blockSelect) {
    blockSelect.value = normalizeFormatBlockValue(document.queryCommandValue("formatBlock") || "p");
  }
}

/** Wires up the formatting toolbar's buttons, keyboard shortcuts, and active-state sync. */
export function initFormattingToolbar(root: HTMLElement): void {
  document.getElementById("format-bold-button")?.addEventListener("click", () => exec("bold"));
  document.getElementById("format-italic-button")?.addEventListener("click", () => exec("italic"));
  document.getElementById("format-underline-button")?.addEventListener("click", () => exec("underline"));
  document.getElementById("format-bullet-list-button")?.addEventListener("click", () => exec("insertUnorderedList"));
  document.getElementById("format-numbered-list-button")?.addEventListener("click", () => exec("insertOrderedList"));
  document.getElementById("format-undo-button")?.addEventListener("click", () => exec("undo"));
  document.getElementById("format-redo-button")?.addEventListener("click", () => exec("redo"));

  document.getElementById("format-block-select")?.addEventListener("change", (event) => {
    exec("formatBlock", `<${(event.target as HTMLSelectElement).value}>`);
    root.focus();
  });

  root.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }
    const command = { b: "bold", i: "italic", u: "underline" }[event.key.toLowerCase()];
    if (command) {
      event.preventDefault();
      exec(command);
    }
  });

  document.addEventListener("selectionchange", () => updateToolbarState(root));
}
