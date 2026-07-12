import { extractDocxText } from "./docxText";
import { extractOdtText } from "./odtText";
import { readFileAsText } from "./readFile";

/** Extracts plain text from an uploaded .txt, .docx, or .odt file, entirely in-browser. */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".docx")) {
    return extractDocxText(file);
  }

  if (name.endsWith(".odt")) {
    return extractOdtText(file);
  }

  if (name.endsWith(".txt")) {
    return readFileAsText(file);
  }

  throw new Error(`Unsupported file type: "${file.name}". Only .txt, .docx, and .odt files are supported.`);
}
