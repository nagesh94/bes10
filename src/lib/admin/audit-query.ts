import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, projects, user } from "@/lib/db/schema";

export type AuditFilter = "all" | "overrides" | "reads";

export interface AuditQuery {
  q?: string;
  actorId?: string;
  type?: AuditFilter;
  limit: number;
}

export interface AuditRow {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  projectCode: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  at: Date;
  actorName: string | null;
}

function filters(query: AuditQuery): SQL | undefined {
  const parts: SQL[] = [];
  const q = query.q?.trim();
  if (q) {
    const pattern = `%${q.slice(0, 80)}%`;
    const match = or(
      ilike(auditLog.action, pattern),
      ilike(auditLog.entityType, pattern),
      ilike(user.name, pattern),
      ilike(projects.code, pattern),
      ilike(auditLog.reason, pattern),
    );
    if (match) parts.push(match);
  }
  if (query.actorId) parts.push(eq(auditLog.actorId, query.actorId));
  if (query.type === "overrides") {
    const match = or(ilike(auditLog.action, "%override%"), ilike(auditLog.action, "%waive%"));
    if (match) parts.push(match);
  } else if (query.type === "reads") {
    parts.push(ilike(auditLog.action, "%read%"));
  }
  return parts.length ? and(...parts) : undefined;
}

const selection = {
  id: auditLog.id,
  action: auditLog.action,
  entityType: auditLog.entityType,
  entityId: auditLog.entityId,
  projectCode: projects.code,
  reason: auditLog.reason,
  before: auditLog.before,
  after: auditLog.after,
  at: auditLog.at,
  actorName: user.name,
};

export async function queryAudit(query: AuditQuery): Promise<{ rows: AuditRow[]; total: number }> {
  const where = filters(query);
  const limit = Math.min(Math.max(query.limit, 1), 5000);

  const [rows, counted] = await Promise.all([
    db
      .select(selection)
      .from(auditLog)
      .leftJoin(user, eq(auditLog.actorId, user.id))
      .leftJoin(projects, eq(auditLog.projectId, projects.id))
      .where(where)
      .orderBy(desc(auditLog.at))
      .limit(limit),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .leftJoin(user, eq(auditLog.actorId, user.id))
      .leftJoin(projects, eq(auditLog.projectId, projects.id))
      .where(where),
  ]);

  return { rows, total: counted[0]?.n ?? 0 };
}

export function isAuditFilter(value: string | undefined): value is AuditFilter {
  return value === "all" || value === "overrides" || value === "reads";
}
