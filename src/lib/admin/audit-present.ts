/**
 * Turns a raw audit row into the sentence the audit board shows.
 *
 * The table stores action codes (`stage.override`, `document.read.aadhaar`).
 * This is the only place those codes become a title, a tag and a tone, so
 * the page and the CSV export stay in step.
 */

import { ROLE_LABEL } from "./role-copy";

export type AuditKind = "override" | "read" | "edit" | "doc" | "ok" | "user";

export interface AuditSource {
  action: string;
  entityType: string;
  projectCode: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

export interface PresentedAudit {
  title: string;
  detail: string;
  tag: string;
  kind: AuditKind;
}

const KNOWN: Record<string, { title: string; tag: string; kind: AuditKind }> = {
  "stage.override": { title: "Stage gate overridden", tag: "Override", kind: "override" },
  "stage.complete": { title: "Stage marked complete", tag: "Update", kind: "ok" },
  "document.read.aadhaar": { title: "Aadhaar document opened", tag: "Document read", kind: "read" },
  "document.generate": { title: "Document generated", tag: "Generate", kind: "doc" },
  "document.generate.agreement": { title: "Agreement generated", tag: "Generate", kind: "doc" },
  "document.upload": { title: "Document uploaded", tag: "Update", kind: "edit" },
  "document.delete": { title: "Document deleted", tag: "Delete", kind: "override" },
  // Both keep the row and drop the file, so the audit entry is the only
  // place the number, the consumer and the amount survive in one line.
  "quotation.delete": { title: "Quotation deleted", tag: "Delete", kind: "override" },
  "agreement.delete": { title: "Agreement deleted", tag: "Delete", kind: "override" },
  "portal.upload.mark": { title: "Marked uploaded to the portal", tag: "Update", kind: "edit" },
  "portal.upload.unmark": { title: "Portal upload mark removed", tag: "Update", kind: "edit" },
  "lead.create": { title: "Lead created", tag: "Update", kind: "edit" },
  "lead.convert": { title: "Lead converted to a prospect", tag: "Update", kind: "ok" },
  "payment.plan.save": { title: "Payment plan saved", tag: "Update", kind: "edit" },
  "payment.plan.lock": { title: "Payment plan locked", tag: "Update", kind: "edit" },
  "payment.plan.unlock": { title: "Payment plan unlocked", tag: "Update", kind: "edit" },
  "payment.received": { title: "Payment recorded", tag: "Update", kind: "edit" },
  "subsidy.update": { title: "Subsidy updated", tag: "Update", kind: "edit" },
  "flag.waive": { title: "Flag waived", tag: "Override", kind: "override" },
  "flag.nameChange.save": { title: "Name-change request updated", tag: "Update", kind: "edit" },
  "flag.loadChange.save": { title: "Load-enhancement request updated", tag: "Update", kind: "edit" },
  "photo.upload": { title: "Photo uploaded", tag: "Update", kind: "edit" },
  "photo.remove": { title: "Photo removed", tag: "Update", kind: "edit" },
  "installation.save": { title: "Installation record saved", tag: "Update", kind: "edit" },
  "installation.serials": { title: "Panel serials saved", tag: "Update", kind: "edit" },
  "installation.structure": { title: "Structure members saved", tag: "Update", kind: "edit" },
  "installation.battery": { title: "Battery bank saved", tag: "Update", kind: "edit" },
  "installation.procurement": { title: "Procurement details saved", tag: "Update", kind: "edit" },
  "evidence.material": { title: "Material used saved", tag: "Update", kind: "edit" },
  "evidence.earthing": { title: "Earthing record saved", tag: "Update", kind: "edit" },
  "portal.refs.save": { title: "Portal references saved", tag: "Update", kind: "edit" },
  "portal.refs.dates": { title: "Portal dates saved", tag: "Update", kind: "edit" },
  "user.invite": { title: "User invited", tag: "Admin", kind: "user" },
  "user.update": { title: "User updated", tag: "Admin", kind: "user" },
  "user.enable": { title: "User enabled", tag: "Admin", kind: "user" },
  "user.disable": { title: "User disabled", tag: "Admin", kind: "user" },
  "user.password": { title: "Password reset by admin", tag: "Admin", kind: "user" },
  "master.add": { title: "Master data added", tag: "Admin", kind: "user" },
  "master.retire": { title: "Master data retired", tag: "Admin", kind: "user" },
  "master.restore": { title: "Master data restored", tag: "Admin", kind: "user" },
  "discom.links": { title: "DISCOM portal links updated", tag: "Admin", kind: "user" },
  "discom.zone.add": { title: "DISCOM zone added", tag: "Admin", kind: "user" },
  "discom.zone.remove": { title: "DISCOM zone removed", tag: "Admin", kind: "user" },
  "template.upload": { title: "Template uploaded", tag: "Admin", kind: "user" },
  "template.activate": { title: "Template activated", tag: "Admin", kind: "user" },
};

/**
 * Audit rows hold whatever role strings were written at the time, including
 * ones no longer in the enum, so this reads through a widened lookup and
 * falls back to the raw value rather than losing it.
 */
const roleLabel = (role: string) => (ROLE_LABEL as Record<string, string>)[role] ?? role;

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function infer(action: string): { title: string; tag: string; kind: AuditKind } {
  if (action.startsWith("prospect.save.")) {
    return { title: "Prospect form saved", tag: "Update", kind: "edit" };
  }
  if (action.includes("override") || action.includes("waive")) {
    return { title: humanize(action), tag: "Override", kind: "override" };
  }
  if (action.includes("read")) {
    return { title: humanize(action), tag: "Document read", kind: "read" };
  }
  if (action.startsWith("user.") || action.startsWith("master.") || action.startsWith("template.") || action.startsWith("discom.")) {
    return { title: humanize(action), tag: "Admin", kind: "user" };
  }
  if (action.startsWith("document.generate")) {
    return { title: humanize(action), tag: "Generate", kind: "doc" };
  }
  return { title: humanize(action), tag: "Update", kind: "edit" };
}

function humanize(action: string): string {
  const words = action.split(/[._]/).filter(Boolean);
  if (words.length === 0) return action;
  const [first, ...rest] = words;
  return [first!.charAt(0).toUpperCase() + first!.slice(1), ...rest].join(" ");
}

function moneyish(key: string, value: string): string | null {
  if (!/amount|rupee|subsidy|paid|tds|gross|net/i.test(key)) return null;
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatValue(key: string, value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    return moneyish(key, String(value)) ?? String(value);
  }
  if (typeof value === "string") {
    if (/aadhaar|password|secret|token/i.test(key)) return null;
    return moneyish(key, value) ?? value;
  }
  return null;
}

function labelKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

function summarize(value: unknown): string {
  const rec = record(value);
  if (!rec) return "";
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(rec)) {
    if (/aadhaar|password|secret|token/i.test(key)) continue;
    const formatted = formatValue(key, raw);
    if (!formatted) continue;
    parts.push(`${labelKey(key)} ${formatted}`);
    if (parts.length === 4) break;
  }
  return parts.join(", ");
}

function detail(source: AuditSource, kind: AuditKind): string {
  const after = record(source.after);
  const before = record(source.before);
  const bits: string[] = [];
  if (source.projectCode) bits.push(source.projectCode);

  if (source.action === "stage.override" || source.action === "stage.complete") {
    const from = before?.stage;
    const to = after?.stage;
    if (from != null && to != null) bits.push(`stage ${from} → ${to}`);
    if (source.reason) bits.push(`Reason: “${source.reason}”`);
    return bits.join(" · ");
  }

  if (source.action === "subsidy.update" && after?.status === "RECEIVED") {
    const amount = formatValue("receivedAmount", after.receivedAmount);
    if (amount) bits.push(amount);
    bits.push("marked received");
    return bits.join(" · ");
  }

  if (source.action.startsWith("user.")) {
    if (typeof after?.email === "string") bits.push(after.email);
    // `roles` is the current shape. Rows written before accounts could hold
    // more than one role carry a single `role` instead, and the history has
    // to stay readable, so both are understood.
    const roles = Array.isArray(after?.roles)
      ? after.roles.filter((role): role is string => typeof role === "string")
      : typeof after?.role === "string"
        ? [after.role]
        : [];
    if (roles.length) bits.push(roles.map(roleLabel).join(" + "));
    if (after?.active === false) bits.push("disabled");
    else if (after?.active === true && before?.active === false) bits.push("re-enabled");
    if (after?.passwordReset === true) bits.push("password reset");
    if (source.reason) bits.push(source.reason);
    return bits.join(" · ");
  }

  if (source.action.startsWith("prospect.save.")) {
    bits.push(source.action.slice("prospect.save.".length).replace(/_/g, " "));
  }

  if (source.reason && kind === "override") bits.push(`Reason: “${source.reason}”`);
  else if (source.reason) bits.push(source.reason);

  const extra = summarize(after);
  if (extra) bits.push(extra);

  const text = bits.join(" · ");
  return text || source.entityType;
}

export function presentAudit(source: AuditSource): PresentedAudit {
  const known = KNOWN[source.action] ?? infer(source.action);
  let kind = known.kind;
  let title = known.title;
  let tag = known.tag;

  if (source.action === "subsidy.update" && record(source.after)?.status === "RECEIVED") {
    title = "Subsidy marked received";
    tag = "Update";
    kind = "ok";
  }

  const text = detail(source, kind);
  return {
    title,
    tag,
    kind,
    detail: text.length > 280 ? `${text.slice(0, 277)}…` : text,
  };
}
