/**
 * The DCR dashboard's arithmetic, kept free of the database so it can be
 * tested on plain rows.
 *
 * Unit of account is the module (one serial). kW is the sum of each module's
 * own Wp, so a certificate mixing ratings still adds up correctly.
 */

export interface CertRow {
  id: number;
  certificateNo: string;
  certDate: string | null;
  supplierId: number | null;
  supplier: string | null;
  moduleManufacturer: string | null;
  modelNo: string | null;
  wattPeak: number | null;
}

export interface SerialRow {
  certificateId: number;
  serialNo: string;
  wattPeak: number | null;
  /** One row per project that lists the serial; null when nobody does. */
  projectId: string | null;
  installationDate: string | null;
}

export interface Bucket {
  key: string;
  label: string;
  certificates: number;
  panels: number;
  installed: number;
  inStock: number;
  kw: number;
  stockKw: number;
}

export interface DashboardStats {
  certificates: number;
  panels: number;
  kw: number;
  installed: number;
  installedKw: number;
  inStock: number;
  stockKw: number;
  /** Serials that two or more projects both list — one of them is wrong. */
  doubleBooked: { serialNo: string; certificateId: number; projects: number }[];
  bySupplier: Bucket[];
  byModel: Bucket[];
  ageing: { key: string; label: string; panels: number; kw: number }[];
  months: { key: string; label: string; received: number; installed: number }[];
  /** Per certificate, for the stock table. */
  perCertificate: Map<number, { panels: number; installed: number; kw: number; stockKw: number }>;
}

const AGE_BUCKETS = [
  { key: "0-30", label: "Under 30 days", max: 30 },
  { key: "31-90", label: "31–90 days", max: 90 },
  { key: "91-180", label: "91–180 days", max: 180 },
  { key: "180+", label: "Over 180 days", max: Infinity },
] as const;

const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

/** yyyy-mm keys from `from` to `to` inclusive. */
export function monthKeys(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while ((y < endY || (y === endY && m <= endM)) && out.length < 120) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function monthLabel(key: string): string {
  return MONTH.format(new Date(`${key}-01T00:00:00Z`));
}

const kwOf = (wp: number | null) => (wp ?? 0) / 1000;

export function computeStats(
  certs: CertRow[],
  serialRows: SerialRow[],
  opts: { today: string; monthFrom: string; monthTo: string },
): DashboardStats {
  const certById = new Map(certs.map((c) => [c.id, c]));

  // Collapse to one entry per serial, remembering how many projects list it.
  const serials = new Map<
    string,
    { certificateId: number; wattPeak: number | null; projects: Set<string>; installedOn: string | null }
  >();
  for (const r of serialRows) {
    if (!certById.has(r.certificateId)) continue;
    const s = serials.get(r.serialNo) ?? {
      certificateId: r.certificateId,
      wattPeak: r.wattPeak ?? certById.get(r.certificateId)?.wattPeak ?? null,
      projects: new Set<string>(),
      installedOn: null,
    };
    if (r.projectId) s.projects.add(r.projectId);
    // Earliest installation date wins when two projects list it.
    if (r.installationDate && (!s.installedOn || r.installationDate < s.installedOn)) {
      s.installedOn = r.installationDate;
    }
    serials.set(r.serialNo, s);
  }

  const bucket = (key: string, label: string): Bucket => ({
    key,
    label,
    certificates: 0,
    panels: 0,
    installed: 0,
    inStock: 0,
    kw: 0,
    stockKw: 0,
  });
  const bySupplier = new Map<string, Bucket>();
  const byModel = new Map<string, Bucket>();
  const perCertificate = new Map<number, { panels: number; installed: number; kw: number; stockKw: number }>();

  for (const c of certs) {
    const sk = String(c.supplierId ?? "none");
    if (!bySupplier.has(sk)) bySupplier.set(sk, bucket(sk, c.supplier ?? "No supplier"));
    bySupplier.get(sk)!.certificates += 1;
    const mk = `${c.modelNo ?? "—"}|${c.wattPeak ?? ""}`;
    if (!byModel.has(mk)) {
      byModel.set(mk, bucket(mk, `${c.modelNo ?? "Unknown model"}${c.wattPeak ? ` · ${c.wattPeak} Wp` : ""}`));
    }
    byModel.get(mk)!.certificates += 1;
    perCertificate.set(c.id, { panels: 0, installed: 0, kw: 0, stockKw: 0 });
  }

  const ageing = AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, panels: 0, kw: 0 }));
  const keys = monthKeys(opts.monthFrom, opts.monthTo);
  const months = new Map(keys.map((k) => [k, { key: k, label: monthLabel(k), received: 0, installed: 0 }]));
  const todayMs = Date.parse(`${opts.today}T00:00:00Z`);

  let kw = 0;
  let installed = 0;
  let installedKw = 0;
  const doubleBooked: DashboardStats["doubleBooked"] = [];

  for (const [serialNo, s] of serials) {
    const c = certById.get(s.certificateId)!;
    const k = kwOf(s.wattPeak);
    const used = s.projects.size > 0;
    kw += k;
    if (used) {
      installed += 1;
      installedKw += k;
    }
    if (s.projects.size > 1) doubleBooked.push({ serialNo, certificateId: s.certificateId, projects: s.projects.size });

    for (const b of [
      bySupplier.get(String(c.supplierId ?? "none"))!,
      byModel.get(`${c.modelNo ?? "—"}|${c.wattPeak ?? ""}`)!,
    ]) {
      b.panels += 1;
      b.kw += k;
      if (used) b.installed += 1;
      else {
        b.inStock += 1;
        b.stockKw += k;
      }
    }

    const pc = perCertificate.get(c.id)!;
    pc.panels += 1;
    pc.kw += k;
    if (used) pc.installed += 1;
    else pc.stockKw += k;

    if (!used && c.certDate) {
      const days = Math.floor((todayMs - Date.parse(`${c.certDate}T00:00:00Z`)) / 86_400_000);
      const i = AGE_BUCKETS.findIndex((b) => days <= b.max);
      ageing[i === -1 ? AGE_BUCKETS.length - 1 : i]!.panels += 1;
      ageing[i === -1 ? AGE_BUCKETS.length - 1 : i]!.kw += k;
    }

    const receivedIn = c.certDate ? months.get(c.certDate.slice(0, 7)) : undefined;
    if (receivedIn) receivedIn.received += 1;
    if (s.installedOn) {
      const m = months.get(s.installedOn.slice(0, 7));
      if (m) m.installed += 1;
    }
  }

  const sortBuckets = (list: Iterable<Bucket>) =>
    [...list].sort((a, b) => b.inStock - a.inStock || b.panels - a.panels || a.label.localeCompare(b.label));

  return {
    certificates: certs.length,
    panels: serials.size,
    kw,
    installed,
    installedKw,
    inStock: serials.size - installed,
    stockKw: kw - installedKw,
    doubleBooked,
    bySupplier: sortBuckets(bySupplier.values()),
    byModel: sortBuckets(byModel.values()),
    ageing,
    months: [...months.values()],
    perCertificate,
  };
}

/** Indian financial year (April–March) containing `today`, as yyyy-mm-dd bounds. */
export function financialYear(today: string, offset = 0): { from: string; to: string; label: string } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const start = (m >= 4 ? y : y - 1) + offset;
  return {
    from: `${start}-04-01`,
    to: `${start + 1}-03-31`,
    label: `FY ${String(start).slice(2)}-${String(start + 1).slice(2)}`,
  };
}
