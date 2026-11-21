import { GOTENBERG_URL } from "../env";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Turns a generated .docx into a PDF via Gotenberg — LibreOffice behind an
 * HTTP API, already running as the `gotenberg` service in docker-compose.
 *
 * Every stage 7/8 document goes through here on its way to storage: the
 * builders write .docx because that is what `docx` produces, but what gets
 * filed, downloaded and uploaded to the portal is the PDF. The submission pack
 * merge uses the same step, since concatenating pages needs one format.
 *
 * The vendor agreement is the exception and stays .docx — it is the draft that
 * goes on stamp paper, and the office does adjust its wording before printing.
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
