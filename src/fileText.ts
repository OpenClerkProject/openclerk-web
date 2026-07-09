import { extractDocxText } from "./docxText";
import { readFileAsText } from "./readFile";

/** Extracts plain text from an uploaded .txt or .docx file, entirely in-browser. */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".docx")) {
    return extractDocxText(file);
  }

  if (name.endsWith(".txt")) {
    return readFileAsText(file);
  }

  throw new Error(`Unsupported file type: "${file.name}". Only .txt and .docx files are supported.`);
}
