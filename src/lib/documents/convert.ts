const GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://localhost:3001";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Turns a generated .docx into a PDF via Gotenberg — LibreOffice behind an
 * HTTP API, already running as the `gotenberg` service in docker-compose.
 *
 * This is used only by the submission pack merge. Every other generated
 * document stays .docx, printed and signed on paper, so the office can still
 * adjust wording before printing — the pack is the one copy meant to be
 * merged and submitted as-is, and merging needs everything in one format.
 */
export async function convertDocxToPdf(buffer: Buffer, fileName: string): Promise<Buffer> {
  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(buffer)], { type: DOCX_MIME }), fileName);

  let res: Response;
  try {
    res = await fetch(`${GOTENBERG_URL}/forms/libreoffice/convert`, {
      method: "POST",
      body: form,
    });
  } catch {
    throw new Error(
      `Could not reach the document converter to produce ${fileName}. Is the gotenberg container running?`,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`The converter could not turn ${fileName} into a PDF (${res.status}): ${text.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
