import { extractText, getDocumentProxy } from "unpdf";

/**
 * The PDF's text layer, pages joined by newlines.
 *
 * NISE certificates are generated, not scanned, so this is normally the whole
 * certificate. A scan or a phone photo saved as PDF comes back (nearly) empty,
 * which is the signal to send the PDF itself to the model instead.
 */
export async function pdfText(bytes: Buffer): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    return text.join("\n");
  } catch {
    return "";
  }
}

/** Below this many letters the PDF is treated as a scan. */
export function looksScanned(text: string): boolean {
  return text.replace(/[^A-Za-z]/g, "").length < 200;
}
