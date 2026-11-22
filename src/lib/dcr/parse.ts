import { EMPTY_FIELDS, normaliseId, normaliseSerial, toIsoDate, type DcrFields } from "./fields";

/**
 * Reads a NISE DCR certificate's text layer with plain patterns.
 *
 * Every certificate the portal prints uses the same template, so the labels
 * ("DCR Certificate Number :", "Solar Cell Manufactured By :", the serial
 * table) are stable enough to anchor on. Free, instant and deterministic —
 * which is also why it is the cross-check on what the model returns: a
 * serial or a certificate number either appears in this text or it does not.
 *
 * Anything a pattern misses is left empty, never guessed.
 */
export function parseDcrText(text: string): DcrFields {
  const out: DcrFields = { ...EMPTY_FIELDS, chain: [], serials: [] };
  const flat = text.replace(/\r/g, "");
  const lines = flat.split("\n").map((l) => l.trim());

  const pick = (re: RegExp, source = flat) => re.exec(source)?.[1]?.trim() ?? "";

  // Header line, repeated on every page.
  const header = /DCR Certificate Number\s*:\s*([\d-]{10,})\s*(?:\(([^)]+)\))?\s*Revision\s*:\s*(\d+)\s*Date\s*:\s*([0-9A-Za-z-/]+)/i.exec(
    flat,
  );
  if (header) {
    out.certificateNo = header[1]!.trim();
    out.certType = header[2]?.trim() ?? "";
    out.revision = header[3]!.trim();
    out.certDate = toIsoDate(header[4]!);
  }

  // Issued to — the block between "To" and the PO line.
  const toIdx = lines.findIndex((l) => /^To$/i.test(l));
  if (toIdx >= 0) out.issuedToName = (lines[toIdx + 1] ?? "").replace(/,\s*$/, "");
  const issuedGst = /GST Number\s*:\s*([0-9A-Z]{15})/i.exec(flat);
  if (issuedGst) out.issuedToGstin = normaliseId(issuedGst[1]!);

  out.purchaseOrderNo = pick(/Purchase Order\s*#\s*([^\s]+)/i);

  // Supplier — "We, <name>, Company Registered as ... at : <address> State: ... GST: ..., PAN: ..."
  const supplierBlock = /We,\s*([^,]+),\s*Company Registered[\s\S]*?at\s*:\s*([\s\S]*?)hereby certify/i.exec(flat);
  if (supplierBlock) {
    out.supplierName = supplierBlock[1]!.trim();
    const block = supplierBlock[2]!.replace(/\s+/g, " ").trim();
    const addr = /^(.*?)\s*State\s*:/i.exec(block);
    out.supplierAddress = (addr?.[1] ?? "").replace(/,\s*$/, "").trim();
    out.supplierState = pick(/State\s*:\s*([^,]+?)\s*,?\s*Pin/i, block);
    out.supplierPincode = pick(/Pin\s*Code\s*:\s*(\d{6})/i, block);
    out.supplierGstin = normaliseId(pick(/GST\s*:\s*([0-9A-Z]{15})/i, block));
    out.supplierPan = normaliseId(pick(/PAN\s*:\s*([A-Z]{5}\d{4}[A-Z])/i, block));
  }

  // Manufacturers, each followed by an address that may wrap onto a second line.
  const maker = (label: RegExp) => {
    const m = label.exec(flat);
    if (!m) return { name: "", address: "" };
    const rest = flat.slice(m.index + m[0].length);
    const name = (rest.split("\n")[0] ?? "").trim();
    const addr = /^[^\n]*\n\s*Address\s*:\s*([\s\S]*?)(?=\n\s*(?:Solar (?:Cell|Module) Manufactured By|We hereby certify)|$)/i.exec(
      rest,
    );
    return { name, address: (addr?.[1] ?? "").replace(/\s+/g, " ").trim() };
  };
  const cell = maker(/Solar Cell Manufactured By\s*:\s*/i);
  out.cellManufacturer = cell.name;
  out.cellManufacturerAddress = cell.address;
  const mod = maker(/Solar Module Manufactured By\s*:\s*/i);
  out.moduleManufacturer = mod.name;
  out.moduleManufacturerAddress = mod.address;

  // Supply line: "SS/26-27/350 17-Nov-2026 3.10 5" under the invoice header.
  const supply = /Invoice\s*\/\s*E-Way Ref[^\n]*\n\s*(\S+)\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})\s+([\d.]+)\s+(\d+)/i.exec(flat);
  if (supply) {
    out.invoiceRef = supply[1]!;
    out.invoiceDate = toIsoDate(supply[2]!);
    out.totalKw = supply[3]!;
    out.quantity = supply[4]!;
  }

  // Item: "PE-132-620THGB-G12R (Wp : 620, Efficiency : 22.95, Cell Technology : TopCon)"
  const item = /^(\S+)\s*\(\s*Wp\s*:\s*(\d+)\s*,\s*Efficiency\s*:\s*([\d.]+)\s*,\s*Cell Technology\s*:\s*([^)]+)\)/im.exec(flat);
  if (item) {
    out.modelNo = item[1]!;
    out.wattPeak = item[2]!;
    out.efficiency = item[3]!;
    out.technology = item[4]!.trim();
    const after = flat.slice(item.index + item[0].length).split("\n")[1] ?? "";
    const desc = /^\s*(.*?)\s+(\d+)\s+([\d.]+)\s*$/.exec(after);
    if (desc) {
      out.moduleDescription = desc[1]!.trim();
      out.quantity ||= desc[2]!;
      out.totalKw ||= desc[3]!;
    } else {
      out.moduleDescription = after.trim();
    }
  }

  out.cellModel = pick(/Cell Model\s*:\s*([^,\n]+)/i);

  // Chain of custody: a date line, then "<Event> - <Party>".
  for (let i = 0; i < lines.length - 1; i++) {
    const d = /^(\d{1,2}-[A-Za-z]{3}-\d{2,4})$/.exec(lines[i]!);
    if (!d) continue;
    const next = lines[i + 1]!;
    const step = /^(.+?)\s+-\s+(.+)$/.exec(next);
    out.chain.push({
      date: toIsoDate(d[1]!) || null,
      event: step ? step[1]!.trim() : next,
      party: step ? step[2]!.trim() : null,
    });
  }

  // Serials, after the "Panel Sr Numbers" heading: "NSMS26100028841 (620 Wp)".
  const serialStart = flat.search(/Panel Sr\.? Numbers/i);
  if (serialStart >= 0) {
    const tail = flat.slice(serialStart);
    const seen = new Set<string>();
    for (const m of tail.matchAll(/\b([A-Z0-9]{8,30})\s*\(\s*(\d+)\s*Wp\s*\)/gi)) {
      const serialNo = normaliseSerial(m[1]!);
      if (seen.has(serialNo)) continue;
      seen.add(serialNo);
      out.serials.push({ serialNo, wattPeak: m[2]! });
    }
  }

  return out;
}

/** How much of the certificate the parser managed to fill. */
export function parserCoverage(fields: DcrFields): { filled: number; total: number; missing: string[] } {
  const keys = [
    "certificateNo",
    "certDate",
    "supplierName",
    "supplierGstin",
    "purchaseOrderNo",
    "invoiceRef",
    "invoiceDate",
    "cellManufacturer",
    "moduleManufacturer",
    "modelNo",
    "wattPeak",
    "quantity",
    "totalKw",
  ] as const;
  const missing = keys.filter((k) => !fields[k]);
  if (fields.serials.length === 0) missing.push("serials" as never);
  return { filled: keys.length + 1 - missing.length, total: keys.length + 1, missing };
}
