import pdfParse from "pdf-parse/lib/pdf-parse.js";

export class UnsupportedFileError extends Error {}

const TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/csv", "application/json"]);

/** Plain text from an uploaded file. PDFs are parsed; text-like files are decoded as UTF-8. */
export async function extractText(file: { buffer: Buffer; mimetype: string; originalname: string }) {
  const name = file.originalname.toLowerCase();
  if (file.mimetype === "application/pdf" || name.endsWith(".pdf")) {
    const { text } = await pdfParse(file.buffer);
    return { text, sourceType: "pdf" };
  }
  if (TEXT_TYPES.has(file.mimetype) || /\.(txt|md|csv|json)$/.test(name)) {
    return { text: file.buffer.toString("utf8"), sourceType: "text" };
  }
  throw new UnsupportedFileError("Only PDF, TXT, MD, CSV and JSON files are supported.");
}
