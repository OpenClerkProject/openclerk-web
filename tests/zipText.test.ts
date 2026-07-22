import JSZip from "jszip";

// Regression tests for the zip-bomb preflight in src/zipText.ts: a maliciously crafted .docx/.odt
// is a small archive whose entries expand to enormous amounts of memory once decompressed. The
// guard rejects such an entry from its declared central-directory sizes *before* calling
// entry.async(), which is the call that would actually allocate the expanded bytes -- the old code
// only checked content.length after decompression, i.e. after the bomb had already gone off.

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const OVER_LIMIT_MESSAGE = /unexpectedly large/;

// Reloads a generated archive through JSZip.loadAsync so the entry carries the declared
// compressed/uncompressed sizes read straight from the zip central directory -- the same code path
// a real uploaded file takes -- rather than the in-memory sizes of a freshly-authored entry.
async function reloadZip(zip: JSZip): Promise<JSZip> {
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  return JSZip.loadAsync(buffer);
}

function fileFromZip(buffer: ArrayBuffer, name: string, type: string): File {
  return new File([buffer], name, { type });
}

describe("openclerk-web zip-bomb defenses (src/zipText.ts)", () => {
  it("rejects a single entry that declares an over-limit uncompressed size, before decompressing", async () => {
    const { readZipEntryWithLimit } = require("../src/zipText");
    // 60 MB of a single repeated byte: well above the 50 MB per-entry cap, but a few dozen KB
    // compressed -- exactly the shape of a zip bomb.
    const zip = new JSZip();
    zip.file("content.xml", "A".repeat(60 * 1024 * 1024), { compression: "DEFLATE" });
    const reloaded = await reloadZip(zip);

    await expect(readZipEntryWithLimit(reloaded, "content.xml")).rejects.toThrow(
      OVER_LIMIT_MESSAGE,
    );
  });

  it("rejects a highly-compressible entry on its declared ratio even when it's under the size cap", async () => {
    const { readZipEntryWithLimit } = require("../src/zipText");
    // 5 MB of a repeated byte: under the 50 MB size cap (so only the ratio guard can catch it), but
    // compresses at roughly 1000:1 -- far above the 200:1 threshold a real document XML part ever
    // reaches, and above the 1 MB floor -- so it must still be rejected.
    const zip = new JSZip();
    zip.file("content.xml", "A".repeat(5 * 1024 * 1024), { compression: "DEFLATE" });
    const reloaded = await reloadZip(zip);

    await expect(readZipEntryWithLimit(reloaded, "content.xml")).rejects.toThrow(
      OVER_LIMIT_MESSAGE,
    );
  });

  it("still reads a normal, legitimately-sized entry", async () => {
    const { readZipEntryWithLimit } = require("../src/zipText");
    const zip = new JSZip();
    zip.file("content.xml", "<office>Ashcroft v. Iqbal, 556 U.S. 662 (2009)</office>", {
      compression: "DEFLATE",
    });
    const reloaded = await reloadZip(zip);

    await expect(readZipEntryWithLimit(reloaded, "content.xml")).resolves.toContain("Ashcroft");
  });

  it("rejects a .docx whose word/document.xml is a zip bomb (extractDocxText path)", async () => {
    const { extractDocxText } = require("../src/docxText");
    const zip = new JSZip();
    const bomb = `<w:document xmlns:w="${WORD_NS}"><w:body><w:p><w:r><w:t>${"A".repeat(
      60 * 1024 * 1024,
    )}</w:t></w:r></w:p></w:body></w:document>`;
    zip.file("word/document.xml", bomb, { compression: "DEFLATE" });
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const file = fileFromZip(
      buffer,
      "bomb.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    await expect(extractDocxText(file)).rejects.toThrow(OVER_LIMIT_MESSAGE);
  });

  it("rejects an .odt whose content.xml is a zip bomb (extractOdtText path)", async () => {
    const { extractOdtText } = require("../src/odtText");
    const zip = new JSZip();
    zip.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });
    const bomb = `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"><office:body><office:text><text:p xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">${"A".repeat(
      60 * 1024 * 1024,
    )}</text:p></office:text></office:body></office:document-content>`;
    zip.file("content.xml", bomb, { compression: "DEFLATE" });
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const file = fileFromZip(buffer, "bomb.odt", "application/vnd.oasis.opendocument.text");

    await expect(extractOdtText(file)).rejects.toThrow(OVER_LIMIT_MESSAGE);
  });
});
