import { isAuditFilter, queryAudit } from "@/lib/admin/audit-query";
import { presentAudit } from "@/lib/admin/audit-present";
import { auditWhen } from "@/lib/admin/format";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

function cell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor || !can(actor, "admin.audit")) {
    return new Response("Not allowed", { status: 404 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const actorId = url.searchParams.get("actor") ?? "";
  const typeParam = url.searchParams.get("type") ?? undefined;
  const type = isAuditFilter(typeParam) ? typeParam : "all";

  const { rows } = await queryAudit({
    q,
    actorId: actorId || undefined,
    type,
    limit: 5000,
  });

  const header = ["When", "Person", "Action", "Title", "Tag", "Project", "Detail"];
  const lines = rows.map((row) => {
    const presented = presentAudit(row);
    return [
      auditWhen(row.at),
      row.actorName ?? "",
      row.action,
      presented.title,
      presented.tag,
      row.projectCode ?? "",
      presented.detail,
    ].map(cell).join(",");
  });

  const body = `\uFEFF${[header.join(","), ...lines].join("\n")}\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"bhim-audit.csv\"",
    },
  });
}
