// pdf-parse ships no types. We import the inner module directly because the package's index.js
// runs a debug block that tries to read a test PDF when loaded as the main module.
declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(data: Buffer): Promise<{ text: string; numpages: number }>;
  export default pdfParse;
}
