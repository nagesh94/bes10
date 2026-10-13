import type { Role } from "@/lib/rbac/permissions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Sep 2026" — the date style on the template cards. */
export function shortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "10 Oct 14:22" — the timestamp on an audit row. */
export function auditWhen(d: Date): string {
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${time}`;
}

/**
 * How long since someone last signed in, in the words the users board uses.
 * A missing date means the account has never had a session.
 */
export function lastSeen(at: Date | null, now = new Date()): string {
  if (!at) return "Never";
  const ms = now.getTime() - at.getTime();
  if (ms < 60_000) return "Just now";

  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return mins === 1 ? "1 minute ago" : `${mins} minutes ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThat = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfThat.getTime()) / 86_400_000);
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff > 1 && dayDiff < 14) return `${dayDiff} days ago`;

  return shortDate(at);
}

const ROLE_NOUN: Record<Role, [string, string]> = {
  ADMIN: ["admin", "admins"],
  EMPLOYEE: ["employee", "employees"],
  INSTALLER: ["installer", "installers"],
  PARTNER: ["channel partner", "channel partners"],
};

/** "9 accounts · 1 admin, 3 employees, 3 installers, 2 channel partners" */
export function accountSummary(counts: Record<Role, number>): string {
  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  const head = `${total} ${total === 1 ? "account" : "accounts"}`;
  const parts = (Object.keys(ROLE_NOUN) as Role[])
    .filter((role) => counts[role] > 0)
    .map((role) => {
      const n = counts[role];
      const [one, many] = ROLE_NOUN[role];
      return `${n} ${n === 1 ? one : many}`;
    });
  return parts.length ? `${head} · ${parts.join(", ")}` : head;
}

export function accountCount(n: number): string {
  return `${n} ${n === 1 ? "account" : "accounts"}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
