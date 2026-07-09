// Helpers for treating a contenteditable element as "the document" -- finding citation text
// inside it and wrapping/unwrapping matches with hyperlinks or embedded-text markers, without a
// Word/Office-style Range API to lean on. Everything here works purely off the DOM Text nodes
// that already exist inside the editor.

const BLOCK_TAGS = new Set(["P", "DIV", "BR", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "TR"]);

interface TextNodeSpan {
  node: Text;
  start: number;
  end: number;
}

interface TextIndex {
  spans: TextNodeSpan[];
  text: string;
}

/**
 * Walks `root`'s Text nodes into one flattened string (so extractCaseCitations/
 * extractParentheticalCitations can scan it like a plain document), inserting a "\n" at
 * block-element boundaries so paragraphs don't run together the way a bare .textContent would.
 * Also returns the node/offset span each character range came from, so a match found in the
 * flattened string can be mapped back to a real DOM Range.
 */
function buildTextIndex(root: Node): TextIndex {
  const spans: TextNodeSpan[] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue || "";
      if (value.length > 0) {
        spans.push({ node: node as Text, start: text.length, end: text.length + value.length });
        text += value;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName)) {
      if (text.length > 0 && !text.endsWith("\n")) {
        text += "\n";
      }
    }
    node = walker.nextNode();
  }
  return { spans, text };
}

/** Plain-text view of the editor content, suitable for extractCaseCitations/parseCaseCitation. */
export function getPlainText(root: Node): string {
  return buildTextIndex(root).text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Citation text passed in here has already been through openclerk-core's normalizeText(), which
// collapses every run of whitespace to a single space -- but the DOM text it needs to match
// against a real paragraph break (rendered as our synthetic "\n") or a stray double space. Turning
// each space in the target into a "\s+" in the search pattern makes the match whitespace-tolerant
// instead of requiring a byte-for-byte substring hit.
function buildFuzzyMatcher(target: string): RegExp {
  const pattern = target
    .split(" ")
    .filter((part) => part.length > 0)
    .map(escapeRegExp)
    .join("\\s+");
  return new RegExp(pattern, "gi");
}

function spanAtIndex(spans: TextNodeSpan[], index: number, preferEnd: boolean): TextNodeSpan | null {
  for (const span of spans) {
    if (preferEnd ? index > span.start && index <= span.end : index >= span.start && index < span.end) {
      return span;
    }
  }
  return null;
}

/** A single occurrence of matched text, expressed as a live DOM Range plus its own text node span. */
export interface DomMatch {
  range: Range;
}

/**
 * Finds every occurrence of `target` (whitespace-fuzzy, case-insensitive) inside `root`, in
 * reverse document order -- so callers that mutate the DOM as they process each match (wrapping
 * it in an <a> or <mark>) never invalidate the node/offset references of matches still queued,
 * since a wrap only ever touches nodes at or after its own position.
 */
export function findMatches(root: Node, target: string): DomMatch[] {
  const trimmed = target.trim();
  if (!trimmed) {
    return [];
  }

  const { spans, text } = buildTextIndex(root);
  const matcher = buildFuzzyMatcher(trimmed);
  const matches: DomMatch[] = [];

  let execResult: RegExpExecArray | null;
  while ((execResult = matcher.exec(text)) !== null) {
    const start = execResult.index;
    const end = start + execResult[0].length;
    if (end === start) {
      matcher.lastIndex += 1;
      continue;
    }

    const startSpan = spanAtIndex(spans, start, false);
    const endSpan = spanAtIndex(spans, end, true);
    if (!startSpan || !endSpan) {
      // The match's boundary landed on a synthetic block-break newline rather than real text --
      // skip it rather than guess at a DOM position that doesn't correspond to real content.
      continue;
    }

    const range = document.createRange();
    range.setStart(startSpan.node, start - startSpan.start);
    range.setEnd(endSpan.node, end - endSpan.start);
    matches.push({ range });
  }

  return matches.reverse();
}

/** True if `node` already sits inside an element matching `selector`, up to (and excluding) `root`. */
export function isInsideMatch(node: Node, root: Node, selector: string): boolean {
  let el: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el && el !== root) {
    if (el.matches(selector)) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Wraps the contents of `range` in a freshly-created element built by `createWrapper`, skipping
 * (and returning false for) ranges that can't be cleanly extracted -- e.g. one boundary sits
 * inside an element the other boundary is outside of. Never throws: a citation that can't be
 * safely wrapped is simply left untouched, same as every provider-lookup failure elsewhere in
 * this codebase.
 */
export function wrapRange(range: Range, createWrapper: () => HTMLElement): HTMLElement | null {
  try {
    const wrapper = createWrapper();
    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
    return wrapper;
  } catch {
    return null;
  }
}

/** Replaces every element matching `selector` inside `root` with its own text content. */
export function unwrapElements(root: HTMLElement, selector: string): number {
  const elements = Array.from(root.querySelectorAll(selector));
  elements.forEach((element) => {
    const text = document.createTextNode(element.textContent || "");
    element.replaceWith(text);
  });
  root.normalize();
  return elements.length;
}

/** Scrolls the first occurrence of `target` into view and briefly highlights it. */
export function flashOccurrence(root: HTMLElement, target: string): boolean {
  const matches = findMatches(root, target);
  const last = matches[matches.length - 1];
  if (!last) {
    return false;
  }

  const wrapper = wrapRange(last.range, () => {
    const mark = document.createElement("mark");
    mark.className = "oc-flash";
    return mark;
  });
  if (!wrapper) {
    return false;
  }

  wrapper.scrollIntoView?.({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    const text = document.createTextNode(wrapper.textContent || "");
    wrapper.replaceWith(text);
    root.normalize();
  }, 1500);
  return true;
}
