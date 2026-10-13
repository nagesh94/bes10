import Link from "next/link";
import { asc } from "drizzle-orm";
import { AuditFilters } from "@/components/admin/audit-filters";
import { isAuditFilter, queryAudit, type AuditFilter } from "@/lib/admin/audit-query";
import { presentAudit, type AuditKind } from "@/lib/admin/audit-present";
import { auditWhen } from "@/lib/admin/format";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

const PAGE = 25;

function tone(kind: AuditKind) {
  if (kind === "override") {
    return {
      row: "bg-[var(--amber-surface)] shadow-[inset_3px_0_0_var(--orange)]",
      icon: "bg-[var(--amber-soft)] text-[var(--amber-text)]",
      tag: "bg-[var(--amber-soft)] text-[var(--amber-text)]",
    };
  }
  if (kind === "read") {
    return {
      row: "",
      icon: "bg-[var(--navy-soft)] text-[var(--link)]",
      tag: "bg-[var(--partner-soft)] text-[var(--partner-text)]",
    };
  }
  if (kind === "ok") {
    return {
      row: "",
      icon: "bg-[var(--green-soft)] text-[var(--green-text)]",
      tag: "bg-[var(--green-soft)] text-[var(--green-text)]",
    };
  }
  if (kind === "user") {
    return {
      row: "",
      icon: "bg-[var(--navy-soft)] text-[var(--link)]",
      tag: "bg-[var(--navy)] text-[var(--navy-ink)]",
    };
  }
  if (kind === "doc") {
    return {
      row: "",
      icon: "bg-[var(--chip-soft)] text-[var(--chip-text)]",
      tag: "bg-[var(--chip-soft)] text-[var(--chip-text)]",
    };
  }
  return {
    row: "",
    icon: "bg-[var(--chip-soft)] text-[var(--chip-text)]",
    tag: "bg-[var(--chip-soft)] text-[var(--chip-text)]",
  };
}

function Icon({ kind }: { kind: AuditKind }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (kind === "override") {
    return (
      <svg {...common}>
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18.4h20.4z" />
      </svg>
    );
  }
  if (kind === "read") {
    return (
      <svg {...common}>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (kind === "ok") {
    return (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (kind === "user") {
    return (
      <svg {...common}>
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />
      </svg>
    );
  }
  if (kind === "doc") {
    return (
      <svg {...common}>
        <path d="M6 2h9l5 5v15H6zM15 2v5h5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 20h4L18 10l-4-4L4 16z" />
    </svg>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; actor?: string; type?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 80);
  const actor = params.actor ?? "";
  const type: AuditFilter = isAuditFilter(params.type) ? params.type : "all";
  const requested = Number(params.limit);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, PAGE), 200) : PAGE;

  const [{ rows, total }, people] = await Promise.all([
    queryAudit({ q, actorId: actor || undefined, type, limit }),
    db.select({ id: user.id, name: user.name }).from(user).orderBy(asc(user.name)),
  ]);

  const exportParams = new URLSearchParams();
  if (q) exportParams.set("q", q);
  if (actor) exportParams.set("actor", actor);
  if (type !== "all") exportParams.set("type", type);
  const exportHref = `/admin/audit/export${exportParams.size ? `?${exportParams}` : ""}`;

  const moreParams = new URLSearchParams(exportParams);
  moreParams.set("limit", String(Math.min(limit + PAGE, 200)));
  const moreHref = `/admin/audit?${moreParams}`;

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-[26px] pb-14">
      <div className="mb-[18px] flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Audit log</h1>
          <p className="m-0 max-w-[760px] text-sm text-[var(--muted)]">
            Every change records who, what, before and after. Reads of an Aadhaar document are logged too, which is why they appear here alongside edits.
          </p>
        </div>
        <a
          href={exportHref}
          className="inline-flex h-[42px] items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13.5px] font-semibold text-[var(--ink)] no-underline"
        >
          Export CSV
        </a>
      </div>

      <AuditFilters q={q} actor={actor} type={type} people={people} />

      <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-sm text-[var(--muted)]">
            {q || actor || type !== "all" ? "Nothing in the log matches." : "No changes have been recorded yet."}
          </p>
        ) : (
          rows.map((row) => {
            const presented = presentAudit(row);
            const style = tone(presented.kind);
            return (
              <div
                key={row.id}
                className={`flex flex-wrap items-center gap-3.5 border-b border-[var(--line-soft)] px-5 py-3.5 ${style.row}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.icon}`}>
                  <Icon kind={presented.kind} />
                </span>
                <div className="min-w-0 flex-[1_1_320px]">
                  <div className="mb-0.5 text-sm font-semibold">{presented.title}</div>
                  <div className="text-[12.5px] leading-snug text-[var(--muted)]">{presented.detail}</div>
                </div>
                <span className={`inline-block shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.05em] uppercase ${style.tag}`}>
                  {presented.tag}
                </span>
                <div className="min-w-32 shrink-0 text-right">
                  <div className="text-[13px] font-semibold">{row.actorName ?? "System"}</div>
                  <div className="ref mt-0.5 text-[11.5px] text-[var(--muted)]">{auditWhen(row.at)}</div>
                </div>
              </div>
            );
          })
        )}
        {total > 0 ? (
          <div className="border-t border-[var(--line-soft)] px-5 py-3.5 text-[13px] text-[var(--muted)]">
            Showing the last {rows.length} of {total.toLocaleString("en-IN")} {total === 1 ? "entry" : "entries"}
            {rows.length < total && limit < 200 ? (
              <>
                {" · "}
                <Link href={moreHref} className="font-semibold">
                  Load more
                </Link>
              </>
            ) : null}
            {rows.length < total && limit >= 200 ? " · Export CSV for the rest." : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
