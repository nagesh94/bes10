import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { DcrTabs } from "@/components/dcr/dcr-tabs";
import { Legend, MonthlyFlow, StockBar } from "@/components/dcr/dcr-charts";
import { hasFilters, loadDashboard, readFilters, type DashboardFilters } from "@/lib/dcr/dashboard";
import { financialYear } from "@/lib/dcr/dashboard-math";
import type { Bucket } from "@/lib/dcr/dashboard-math";

const n = (v: number) => v.toLocaleString("en-IN");
const kw = (v: number) => `${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })} kW`;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const selectCls =
  "h-10 min-w-0 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const card = "rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]";

/**
 * Where the DCR stock stands: what was certified to us, what has gone on a
 * roof, what is still in the store and for how long, and which projects
 * have serials no certificate covers.
 *
 * Every figure is counted per module (one serial), so a certificate mixing
 * ratings and a serial listed on two projects are both counted correctly.
 */
export default async function DcrDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor || !can(actor, "document.read")) notFound();

  const f = readFilters(await searchParams);
  const today = new Date().toISOString().slice(0, 10);
  const { stats, issues, stockTable, options } = await loadDashboard(f, today);
  const filtered = hasFilters(f);

  const thisFy = financialYear(today);
  const lastFy = financialYear(today, -1);
  const d90 = new Date(`${today}T00:00:00Z`);
  d90.setUTCDate(d90.getUTCDate() - 90);
  const presets = [
    { label: "All time", from: "", to: "" },
    { label: thisFy.label, from: thisFy.from, to: thisFy.to },
    { label: lastFy.label, from: lastFy.from, to: lastFy.to },
    { label: "Last 90 days", from: d90.toISOString().slice(0, 10), to: today },
  ];
  const presetHref = (p: { from: string; to: string }) => href({ ...f, from: p.from, to: p.to });
  const activePreset = presets.find((p) => p.from === f.from && p.to === f.to);

  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-7 pb-14 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">DCR dashboard</h1>
          <p className="text-sm text-[var(--muted)]">
            Certified panels, what has been installed, and what is still in stock
            {filtered ? " — filtered" : ""}.
          </p>
        </div>
        {can(actor, "document.upload") ? (
          <Link
            href="/dcr/new"
            className="flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
          >
            Upload certificate
          </Link>
        ) : null}
      </div>

      <DcrTabs active="dashboard" />

      {/* Filters: one row, above everything they affect. */}
      <form action="/dcr/dashboard" className={`${card} mb-4.5 p-3.5`}>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {presets.map((p) => (
            <Link
              key={p.label}
              href={presetHref(p)}
              aria-current={activePreset === p ? "true" : undefined}
              className={`rounded-full px-3 py-1 text-[12.5px] font-semibold no-underline ${
                activePreset === p
                  ? "bg-[var(--navy)] text-[var(--navy-ink)]"
                  : "bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--chip-soft)]"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
          <label className="col-span-1">
            <span className="mb-1 block text-[11.5px] font-semibold text-[var(--muted)]">Certificate from</span>
            <input type="date" name="from" defaultValue={f.from} className={`${selectCls} w-full`} />
          </label>
          <label className="col-span-1">
            <span className="mb-1 block text-[11.5px] font-semibold text-[var(--muted)]">to</span>
            <input type="date" name="to" defaultValue={f.to} className={`${selectCls} w-full`} />
          </label>
          <Select name="supplier" label="Supplier" value={f.supplier ? String(f.supplier) : ""} any="Any supplier"
            options={options.suppliers.map((s) => ({ value: String(s.id), label: s.name }))} />
          <Select name="manufacturer" label="Manufacturer" value={f.manufacturer} any="Any manufacturer"
            options={options.manufacturers.map((v) => ({ value: v, label: v }))} />
          <Select name="model" label="Model" value={f.model} any="Any model"
            options={options.models.map((v) => ({ value: v, label: v }))} />
          <Select name="wp" label="Wp" value={f.wp ? String(f.wp) : ""} any="Any Wp"
            options={options.wps.map((v) => ({ value: String(v), label: `${v} Wp` }))} />
          <Select name="tech" label="Technology" value={f.tech} any="Any technology"
            options={options.techs.map((v) => ({ value: v, label: v }))} />
          <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
            <button
              type="submit"
              className="h-10 flex-1 cursor-pointer rounded-lg bg-[var(--navy)] px-3 text-[13px] font-bold text-[var(--navy-ink)]"
            >
              Apply
            </button>
            {filtered ? (
              <Link
                href="/dcr/dashboard"
                className="flex h-10 items-center rounded-lg border border-[var(--line)] px-3 text-[13px] font-bold text-[var(--navy-text)] no-underline"
              >
                Reset
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {/* Headline figures */}
      <div className="mb-4.5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Certificates" value={n(stats.certificates)} sub={`${stats.bySupplier.length} supplier${stats.bySupplier.length === 1 ? "" : "s"}`} />
        <Tile label="Panels certified" value={n(stats.panels)} sub={kw(stats.kw)} />
        <Tile
          label="Installed"
          value={n(stats.installed)}
          sub={`${kw(stats.installedKw)} · ${pct(stats.installed, stats.panels)}%`}
          swatch="var(--data-1)"
        />
        <Tile label="In stock" value={n(stats.inStock)} sub={kw(stats.stockKw)} swatch="var(--data-3)" />
        <Tile
          label="Projects with DCR issues"
          value={n(issues.length)}
          sub={issues.length ? "serials not covered" : "all serials covered"}
          tone={issues.length ? "amber" : "good"}
          href={issues.length ? "#issues" : undefined}
        />
        <Tile
          label="Serials on 2 projects"
          value={n(stats.doubleBooked.length)}
          sub={stats.doubleBooked.length ? "one record is wrong" : "none"}
          tone={stats.doubleBooked.length ? "red" : "good"}
          href={stats.doubleBooked.length ? "#double" : undefined}
        />
      </div>

      <div className="mb-4.5 flex flex-wrap items-stretch gap-4.5">
        <section className={`${card} min-w-80 flex-[2_1_560px] px-5 py-4.5`}>
          <h2 className="mb-0.5 text-[15px] font-bold">Panels received vs installed</h2>
          <p className="mb-3.5 text-[12.5px] text-[var(--muted)]">
            Per month — received by certificate date, installed by installation date.
          </p>
          <MonthlyFlow months={stats.months} />
        </section>

        <section className={`${card} min-w-72 flex-[1_1_300px] px-5 py-4.5`}>
          <h2 className="mb-0.5 text-[15px] font-bold">Stock age</h2>
          <p className="mb-4 text-[12.5px] text-[var(--muted)]">
            Panels still in stock, by how long ago they were certified. Fit the oldest first.
          </p>
          {stats.inStock === 0 ? (
            <p className="text-[13px] text-[var(--muted)]">Nothing in stock.</p>
          ) : (
            <ul className="space-y-3.5">
              {stats.ageing.map((a) => (
                <li key={a.key}>
                  <div className="mb-1 flex items-baseline gap-2 text-[13px]">
                    <span className="flex-1 font-medium">{a.label}</span>
                    <span className="num font-semibold">{n(a.panels)}</span>
                    <span className="num w-20 text-right text-[12px] text-[var(--muted)]">{kw(a.kw)}</span>
                  </div>
                  <span className="block h-2 overflow-hidden rounded-full bg-[var(--data-track)]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${pct(a.panels, stats.inStock)}%`, backgroundColor: "var(--data-3)" }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mb-4.5 flex flex-wrap items-start gap-4.5">
        <BucketTable title="By supplier" rows={stats.bySupplier} />
        <BucketTable title="By model" rows={stats.byModel} />
      </div>

      <section id="issues" className={`${card} mb-4.5 overflow-hidden`}>
        <div className="flex flex-wrap items-baseline gap-2 border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="flex-1 text-[15px] font-bold">Projects with serials not covered</h2>
          <span className="text-[12px] text-[var(--muted)]">All projects — not narrowed by the filters</span>
        </div>
        {issues.length === 0 ? (
          <p className="px-5 py-5 text-[13px] text-[var(--green-text)]">✓ Every recorded panel serial is on a stored certificate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="bg-[var(--surface-2)]">
                  {["Project", "Customer", "Not on a certificate", "On another project", "Since", ""].map((h) => (
                    <th key={h} className="border-b border-[var(--line)] px-5 py-2.5 text-left text-[12px] font-semibold text-[var(--muted)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {issues.map((r) => (
                  <tr key={r.projectId} className="border-b border-[var(--line-soft)]">
                    <td className="ref px-5 py-3 text-[13px]">
                      <Link href={`/projects/${r.projectId}`} className="no-underline">{r.code}</Link>
                    </td>
                    <td className="px-5 py-3 text-[13px]">{r.customer || "—"}</td>
                    <td className="num px-5 py-3 text-[13px]">
                      {r.missing ? <span className="font-semibold text-[var(--red-text)]">✗ {r.missing}</span> : "—"}
                      <span className="text-[var(--muted)]"> of {r.total}</span>
                    </td>
                    <td className="num px-5 py-3 text-[13px]">
                      {r.elsewhere ? <span className="font-semibold text-[var(--amber-text)]">⚠ {r.elsewhere}</span> : "—"}
                    </td>
                    <td className="ref px-5 py-3 text-[12.5px] text-[var(--muted)]">{r.detectedAt.toISOString().slice(0, 10)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/projects/${r.projectId}/flags`} className="text-[12.5px] font-semibold">
                        Resolve
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {stats.doubleBooked.length ? (
        <section id="double" className={`${card} mb-4.5 border-[var(--red-border)] px-5 py-4`}>
          <h2 className="mb-1 text-[15px] font-bold text-[var(--red-text)]">Serials recorded on two projects</h2>
          <p className="mb-3 text-[12.5px] text-[var(--muted)]">
            A module can only be on one roof. Open the certificate to see both projects and correct the wrong one.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {stats.doubleBooked.map((d) => (
              <Link
                key={d.serialNo}
                href={`/dcr/${d.certificateId}`}
                className="ref rounded-full border border-[var(--red-border)] bg-[var(--red-surface)] px-2.5 py-0.5 text-[12px] text-[var(--red-text)] no-underline"
              >
                {d.serialNo} · {d.projects} projects
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="flex-1 text-[15px] font-bold">Stock by certificate</h2>
          <span className="text-[12px] text-[var(--muted)]">Oldest first</span>
          <Legend keys={["installed", "inStock"]} />
        </div>
        {stockTable.length === 0 ? (
          <p className="px-5 py-5 text-[13px] text-[var(--muted)]">
            {stats.certificates ? "Every certified panel has been installed." : "No certificates match these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="bg-[var(--surface-2)]">
                  {["Certificate", "Date", "Supplier", "Model", "In stock", "Used", ""].map((h) => (
                    <th key={h} className="border-b border-[var(--line)] px-5 py-2.5 text-left text-[12px] font-semibold text-[var(--muted)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockTable.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--line-soft)]">
                    <td className="ref px-5 py-3 text-[13px]">
                      <Link href={`/dcr/${c.id}`} className="no-underline">{c.certificateNo}</Link>
                    </td>
                    <td className="ref px-5 py-3 text-[12.5px] text-[var(--muted)]">{c.certDate ?? "—"}</td>
                    <td className="px-5 py-3 text-[13px]">{c.supplier ?? "—"}</td>
                    <td className="px-5 py-3 text-[12.5px]">
                      <span className="ref">{c.modelNo ?? "—"}</span>
                      {c.wattPeak ? <span className="text-[var(--muted)]"> · {c.wattPeak} Wp</span> : null}
                    </td>
                    <td className="num px-5 py-3 text-[13px] font-semibold whitespace-nowrap">
                      {n(c.panels - c.installed)} <span className="font-normal text-[var(--muted)]">· {kw(c.stockKw)}</span>
                    </td>
                    <td className="num px-5 py-3 text-[12.5px] whitespace-nowrap text-[var(--muted)]">
                      {n(c.installed)} of {n(c.panels)}
                    </td>
                    <td className="w-40 px-5 py-3">
                      <StockBar installed={c.installed} inStock={c.panels - c.installed} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function href(f: DashboardFilters) {
  const q = new URLSearchParams();
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (f.supplier) q.set("supplier", String(f.supplier));
  if (f.manufacturer) q.set("manufacturer", f.manufacturer);
  if (f.model) q.set("model", f.model);
  if (f.wp) q.set("wp", String(f.wp));
  if (f.tech) q.set("tech", f.tech);
  const s = q.toString();
  return `/dcr/dashboard${s ? `?${s}` : ""}`;
}

function Select({
  name,
  label,
  value,
  any,
  options,
}: {
  name: string;
  label: string;
  value: string;
  any: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="col-span-1 min-w-0">
      <span className="mb-1 block text-[11.5px] font-semibold text-[var(--muted)]">{label}</span>
      <select name={name} defaultValue={value} className={`${selectCls} w-full`}>
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Tile({
  label,
  value,
  sub,
  swatch,
  tone,
  href: to,
}: {
  label: string;
  value: string;
  sub: string;
  swatch?: string;
  tone?: "good" | "amber" | "red";
  href?: string;
}) {
  const toneCls =
    tone === "red"
      ? "border-[var(--red-border)] bg-[var(--red-surface)]"
      : tone === "amber"
        ? "border-[var(--amber-border)] bg-[var(--amber-surface)]"
        : "border-[var(--line)] bg-[var(--surface)]";
  const icon = tone === "red" ? "✗ " : tone === "amber" ? "⚠ " : tone === "good" ? "✓ " : "";
  const body = (
    <>
      <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--muted)]">
        {swatch ? <span aria-hidden className="block h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: swatch }} /> : null}
        {label}
      </span>
      <span className="num block text-[26px] leading-none font-semibold tracking-[-0.02em] text-[var(--ink)]">{value}</span>
      <span className="mt-1.5 block text-[12px] text-[var(--muted)]">
        {icon}
        {sub}
      </span>
    </>
  );
  const cls = `block rounded-[var(--radius)] border px-4 py-3.5 no-underline ${toneCls}`;
  return to ? (
    <Link href={to} className={`${cls} hover:border-[var(--orange)]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function BucketTable({ title, rows }: { title: string; rows: Bucket[] }) {
  return (
    <section className={`${card} min-w-80 flex-[1_1_440px] overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-5 py-3.5">
        <h2 className="flex-1 text-[15px] font-bold">{title}</h2>
        <Legend keys={["installed", "inStock"]} />
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-5 text-[13px] text-[var(--muted)]">No certificates match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr className="bg-[var(--surface-2)]">
                {["", "Certified", "In stock", ""].map((h, i) => (
                  <th key={i} className="border-b border-[var(--line)] px-4 py-2 text-left text-[12px] font-semibold text-[var(--muted)]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.key} className="border-b border-[var(--line-soft)]">
                  <td className="px-4 py-2.5 text-[13px]">
                    <div className="font-semibold">{b.label}</div>
                    <div className="text-[11.5px] text-[var(--muted)]">
                      {b.certificates} certificate{b.certificates === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td className="num px-4 py-2.5 text-[12.5px] whitespace-nowrap">
                    {n(b.panels)} <span className="text-[var(--muted)]">· {kw(b.kw)}</span>
                  </td>
                  <td className="num px-4 py-2.5 text-[12.5px] font-semibold whitespace-nowrap">
                    {n(b.inStock)} <span className="font-normal text-[var(--muted)]">· {kw(b.stockKw)}</span>
                  </td>
                  <td className="w-32 px-4 py-2.5">
                    <StockBar installed={b.installed} inStock={b.inStock} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
