// The actual PDF text extraction (pdf.js + tesseract.js OCR) needs a real browser -- a real
// <canvas>, a real Worker, and WASM -- none of which jsdom provides, so ./pdfText is mocked here
// and this file exercises everything downstream of it: the citation extraction/clustering wiring
// and the CourtListener verification flow. See the manual verification note in README.md for how
// the real extraction path (including OCR) was confirmed against a real PDF.

const mockExtractPdfText = jest.fn();
jest.mock("../src/pdf/pdfText", () => ({
  extractPdfText: (...args: unknown[]) => mockExtractPdfText(...args),
}));

function setUpDom(): void {
  document.body.innerHTML = `
    <input type="file" id="pdf-input" />
    <input type="checkbox" id="verify-checkbox" />
    <input type="text" id="courtlistener-token" />
    <button id="extract-button"></button>
    <p id="page-summary"></p>
    <p id="status"></p>
    <div id="results"></div>
  `;
}

function selectFile(file: File): void {
  const input = document.getElementById("pdf-input") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
}

// Real excerpt from the affirmation in opposition filed in Mata v. Avianca, Inc., No.
// 1:22-cv-01461-PKC (S.D.N.Y.), Document 21 (Mar. 1, 2023) -- the filing behind the widely
// reported ChatGPT-fabricated-citation incident. The full PDF is persisted at
// tests/fixtures/mata-v-avianca-filing.pdf; its pages have no embedded text layer of their own
// (only a CM/ECF header stamp does), so this excerpt is exactly what the real OCR pipeline
// recovers -- see README.md for how that was verified against the actual file.
const MATA_FILING_EXCERPT = `
Similarly, in Peterson v. Iran Air, 905 F. Supp. 2d 121 (D.D.C. 2012), the District Court for
the District of Columbia held that state courts have concurrent jurisdiction over claims arising
out of an international airline accident under the Montreal Convention.

In Ehrlich v. American Airlines, Inc., 360 N.J. Super. 360 (App. Div. 2003), the New Jersey
Appellate Division held that state courts have jurisdiction over claims arising out of an
international airline accident.

In Martinez v. Delta Airlines, Inc., 2019 WL 4639462 (Tex. App. Sept. 25, 2019), the plaintiff
brought a negligence claim against Delta Airlines in Texas state court.
`;

// Returns the actual matched case name in the mocked response (not a placeholder) -- CourtListener
// resolves by citation locator and returns its own real case name for whatever it finds there, and
// checkCitationsForHallucinations only treats a match as verified when that name corresponds to the
// citation's own parsed name (see caseNamesMatch in openclerk-core). A mock that always returned a
// fixed placeholder name regardless of which citation was being checked would silently stop
// exercising that check.
function installCourtListenerFetchMock(knownCaseNames: string[]): jest.Mock {
  const fetchMock = jest.fn(async (_url: string, init: RequestInit) => {
    const body = String(init.body);
    const matchedName = knownCaseNames.find((name) =>
      body.includes(encodeURIComponent(name).replace(/%20/g, "+")),
    );
    const responseBody = matchedName
      ? [
          {
            status: 200,
            citation: matchedName,
            clusters: [{ case_name: matchedName, absolute_url: "/opinion/1/x/" }],
          },
        ]
      : [{ status: 404, clusters: [] }];
    return { ok: true, status: 200, json: async () => responseBody } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("openclerk-web PDF & OCR tools page", () => {
  beforeEach(() => {
    jest.resetModules();
    mockExtractPdfText.mockReset();
    setUpDom();
  });

  it("extracts and reports case citations from the recovered PDF text", async () => {
    mockExtractPdfText.mockResolvedValue([
      { pageNumber: 1, text: MATA_FILING_EXCERPT, source: "ocr" },
    ]);

    const { runExtraction } = require("../src/pdf/main");
    selectFile(new File(["dummy"], "filing.pdf", { type: "application/pdf" }));
    await runExtraction();

    const results = document.getElementById("results")!;
    expect(results.textContent).toContain("Peterson v. Iran Air");
    expect(results.textContent).toContain("Martinez v. Delta Airlines, Inc.");
    expect(results.textContent).toContain("Ehrlich v. American Airlines, Inc.");
    expect(document.getElementById("page-summary")!.textContent).toContain("1 page(s)");
  });

  it("flags the two fabricated citations as unverified when checked against CourtListener", async () => {
    mockExtractPdfText.mockResolvedValue([
      { pageNumber: 1, text: MATA_FILING_EXCERPT, source: "ocr" },
    ]);
    installCourtListenerFetchMock(["Ehrlich v. American Airlines, Inc."]);

    const { runExtraction } = require("../src/pdf/main");
    selectFile(new File(["dummy"], "filing.pdf", { type: "application/pdf" }));
    (document.getElementById("verify-checkbox") as HTMLInputElement).checked = true;
    (document.getElementById("courtlistener-token") as HTMLInputElement).value = "test-token";
    await runExtraction();

    const resultsText = document.getElementById("results")!.textContent || "";
    expect(resultsText).toMatch(/Peterson v\. Iran Air[\s\S]*possible hallucination/);
    expect(resultsText).toMatch(/Martinez v\. Delta Airlines, Inc\.[\s\S]*possible hallucination/);
    expect(resultsText).toMatch(/Ehrlich v\. American Airlines, Inc\.[\s\S]*Verified via/);
  });

  // Regression test for a real production bug: this page showed "Verified via CourtListener" for
  // "Peterson v. Iran Air, 905 F. Supp. 2d 121 (D.D.C. 2012)" -- one of the two ChatGPT-fabricated
  // citations from this exact filing -- because CourtListener's citation-lookup API resolves by
  // locator (reporter/volume/page), not by case name, and this page wasn't checking that the
  // returned case name actually matched. Fixed in openclerk-core's checkCitationsForHallucinations
  // (caseNamesMatch); this confirms the fix is actually wired up on this page, not just in core's
  // own test suite.
  it("does not verify a fabricated case name when its citation locator resolves to a real, different case", async () => {
    mockExtractPdfText.mockResolvedValue([
      { pageNumber: 1, text: MATA_FILING_EXCERPT, source: "ocr" },
    ]);
    const fetchMock = jest.fn(async () => {
      const responseBody = [
        {
          status: 200,
          citation: "match",
          clusters: [
            { case_name: "Peterson v. Islamic Republic of Iran", absolute_url: "/opinion/1/x/" },
          ],
        },
      ];
      return { ok: true, status: 200, json: async () => responseBody } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { runExtraction } = require("../src/pdf/main");
    selectFile(new File(["dummy"], "filing.pdf", { type: "application/pdf" }));
    (document.getElementById("verify-checkbox") as HTMLInputElement).checked = true;
    (document.getElementById("courtlistener-token") as HTMLInputElement).value = "test-token";
    await runExtraction();

    const resultsText = document.getElementById("results")!.textContent || "";
    expect(resultsText).not.toMatch(/Peterson v\. Iran Air[\s\S]*Verified via/);
    expect(resultsText).toMatch(
      /Peterson v\. Iran Air[\s\S]*resolves this citation to a different case/,
    );
    expect(resultsText).toMatch(/Islamic Republic of Iran/);
  });

  it("shows a message when no file is chosen", async () => {
    const { runExtraction } = require("../src/pdf/main");
    await runExtraction();
    expect(document.getElementById("status")!.textContent).toBe("Choose a PDF file first.");
    expect(mockExtractPdfText).not.toHaveBeenCalled();
  });

  it("reports when no citations are found", async () => {
    mockExtractPdfText.mockResolvedValue([
      { pageNumber: 1, text: "No case law here at all.", source: "embedded" },
    ]);

    const { runExtraction } = require("../src/pdf/main");
    selectFile(new File(["dummy"], "filing.pdf", { type: "application/pdf" }));
    await runExtraction();

    expect(document.getElementById("status")!.textContent).toContain(
      "No case citations were found",
    );
  });
});
