// Property-based tests (fast-check) for the pure text-processing helpers that turn *untrusted*
// input -- OCR output, imported document text -- into editor HTML. Example-based tests in
// studio.test.ts cover the expected shapes; these fuzz thousands of random inputs to pin down the
// invariants that matter for safety: the renderer must never inject live markup from text, and the
// low-confidence highlighter must never alter the document's actual text.

import fc from "fast-check";
import { highlightLowConfidence, markdownToHtml } from "../src/studio/chrome";

// Tags markdownToHtml must never emit: it only ever produces p/b/i/h1-3/ul/li/table/thead/tbody/
// tr/th/td/br. If any of these appears, some `<...>` in the source text was NOT escaped -- an XSS
// hole, since the result is assigned to innerHTML.
const FORBIDDEN_TAGS = "script, img, iframe, object, embed, svg, a, style, link, form, input";

// A generator that interleaves random text with concrete HTML/markdown-injection fragments, so the
// fuzzer actually exercises the escaping path rather than mostly producing plain words.
const htmlishText = fc
  .array(
    fc.oneof(
      fc.constantFrom(
        "<script>alert(1)</script>",
        "<img src=x onerror=alert(1)>",
        '<a href="javascript:alert(1)">x</a>',
        "<iframe src=evil>",
        "<svg/onload=alert(1)>",
        "</p><p>",
        "**bold**",
        "&",
        "<",
        ">",
        '"',
        "| a | b |",
        "# heading",
      ),
      fc.string(),
      fc.fullUnicodeString(),
    ),
    { maxLength: 12 },
  )
  .map((parts) => parts.join(" "));

const headingArb = fc.array(
  fc.record({ text: fc.string(), level: fc.integer({ min: -3, max: 9 }) }),
  { maxLength: 6 },
);

describe("markdownToHtml (property-based)", () => {
  it("never throws for any markdown + headings input", () => {
    fc.assert(
      fc.property(htmlishText, headingArb, (markdown, headings) => {
        expect(typeof markdownToHtml(markdown, headings)).toBe("string");
      }),
    );
  });

  it("never emits live/dangerous markup from source text (escapes it)", () => {
    fc.assert(
      fc.property(htmlishText, headingArb, (markdown, headings) => {
        const host = document.createElement("div");
        host.innerHTML = markdownToHtml(markdown, headings);
        expect(host.querySelector(FORBIDDEN_TAGS)).toBeNull();
      }),
    );
  });
});

describe("highlightLowConfidence (property-based)", () => {
  it("never throws and leaves the document's text content unchanged", () => {
    fc.assert(
      fc.property(
        fc.fullUnicodeString(),
        fc.array(fc.string(), { maxLength: 8 }),
        (text, words) => {
          const root = document.createElement("div");
          root.textContent = text;
          const before = root.textContent;
          highlightLowConfidence(root, words);
          // Highlighting only wraps matches in <mark>; it must never add, drop, or edit any character.
          expect(root.textContent).toBe(before);
        },
      ),
    );
  });

  it('only ever introduces <mark class="oc-lowconf"> elements', () => {
    fc.assert(
      fc.property(
        fc.fullUnicodeString(),
        fc.array(fc.string(), { maxLength: 8 }),
        (text, words) => {
          const root = document.createElement("div");
          root.textContent = text;
          highlightLowConfidence(root, words);
          for (const el of Array.from(root.querySelectorAll("*"))) {
            expect(el.tagName).toBe("MARK");
            expect(el.className).toBe("oc-lowconf");
          }
        },
      ),
    );
  });
});
