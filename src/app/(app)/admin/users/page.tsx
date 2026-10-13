import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import {
  CreateUser,
  UserList,
  type PartnerOption,
  type UserRow,
} from "@/components/admin/user-admin";
import { db } from "@/lib/db";
import { channelPartners, user } from "@/lib/db/schema";
import { can } from "@/lib/rbac/permissions";
import { ROLES } from "@/lib/rbac/roles";
import { getActor } from "@/lib/session";

/**
 * Staff accounts and what each one can reach.
 *
 * The role list here is the same matrix the server enforces on every action,
 * so what this page says a role can do is what it can actually do — there is
 * no second copy of the rules to drift.
 */
export default async function AdminUsersPage() {
  const actor = await getActor();
  if (!actor || !can(actor, "admin.users")) notFound();

  const users = await db.select().from(user).orderBy(asc(user.role), asc(user.name));
  const partners = await db
    .select()
    .from(channelPartners)
    .where(eq(channelPartners.active, true))
    .orderBy(asc(channelPartners.name));

  const partnerName = new Map(partners.map((p) => [p.id, p.name]));

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    partnerId: u.partnerId ?? null,
    partnerName: u.partnerId ? (partnerName.get(u.partnerId) ?? null) : null,
    isSelf: u.id === actor.id,
    createdAt: u.createdAt.toISOString(),
  }));

  const options: PartnerOption[] = partners.map((p) => ({ id: p.id, name: p.name }));

  const counts = new Map<string, number>();
  for (const u of users) counts.set(u.role, (counts.get(u.role) ?? 0) + 1);

  return (
    <main className="mx-auto max-w-[1000px] px-6 pt-5 pb-14">
      <div className="mb-5">
        <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Users</h1>
        <p className="text-sm text-[var(--muted)]">
          {users.length} {users.length === 1 ? "account" : "accounts"}. A role decides what the
          person can reach, and the server enforces it on every action — not just in the menu.
        </p>
      </div>

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-3 text-base font-bold">What each role can do</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
          {ROLES.map((r) => (
            <div key={r.value} className="rounded-[9px] bg-[var(--surface-2)] px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[13.5px] font-bold">{r.label}</span>
                <span className="ref text-[11.5px] text-[var(--muted)]">
                  {counts.get(r.value) ?? 0}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">{r.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-0.5 text-base font-bold">Add someone</h2>
        <p className="mb-4 text-[13px] text-[var(--muted)]">
          Set a temporary password and give it to them directly. It is hashed on the way in and
          cannot be read back from here afterwards.
        </p>
        <CreateUser partners={options} />
      </section>

      <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-3.5 text-base font-bold">Accounts</h2>
        <UserList users={rows} partners={options} />
      </section>
    </main>
  );
}
