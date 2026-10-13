"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createUser, setUserRole } from "@/app/actions/users";
import { ROLES, type Role } from "@/lib/rbac/roles";

const cell =
  "h-11 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";
const primary =
  "h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60";

export interface PartnerOption {
  id: string;
  name: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  partnerId: string | null;
  partnerName: string | null;
  isSelf: boolean;
  createdAt: string;
}

/**
 * Creates a staff account.
 *
 * The password is typed here once and goes straight to Better Auth's sign-up
 * on the server; it is never stored by this app in any other form. Whoever
 * creates the account has to pass it on to the person out of band.
 */
export function CreateUser({ partners }: { partners: PartnerOption[] }) {
  const router = useRouter();
  const [v, setV] = useState({
    name: "",
    email: "",
    password: "",
    role: "EMPLOYEE" as Role,
    partnerId: "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <div>
          <label className={labelCls} htmlFor="u-name">Name</label>
          <input
            id="u-name"
            value={v.name}
            onChange={(e) => setV((o) => ({ ...o, name: e.target.value }))}
            placeholder="Priya Sharma"
            className={cell}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="u-email">Email</label>
          <input
            id="u-email"
            type="email"
            value={v.email}
            onChange={(e) => setV((o) => ({ ...o, email: e.target.value }))}
            placeholder="priya@bhimenergy.in"
            className={cell}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="u-pass">Temporary password</label>
          <input
            id="u-pass"
            type="password"
            value={v.password}
            onChange={(e) => setV((o) => ({ ...o, password: e.target.value }))}
            placeholder="at least 8 characters"
            className={cell}
          />
        </div>
      </div>

      <div className="mb-4">
        <div className={labelCls}>Role</div>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={v.role === r.value}
              onClick={() => setV((o) => ({ ...o, role: r.value }))}
              className={`cursor-pointer rounded-lg px-3.5 py-2.5 text-left ${
                v.role === r.value
                  ? "bg-[var(--navy)] text-[var(--navy-ink)]"
                  : "border border-[var(--line)] bg-[var(--surface)]"
              }`}
            >
              <span className="block text-[13px] font-bold">{r.label}</span>
              <span
                className={`mt-0.5 block text-[11px] ${
                  v.role === r.value ? "opacity-75" : "text-[var(--muted)]"
                }`}
              >
                {r.note}
              </span>
            </button>
          ))}
        </div>
      </div>

      {v.role === "PARTNER" ? (
        <div className="mb-4 max-w-sm">
          <label className={labelCls} htmlFor="u-partner">Which partner?</label>
          <select
            id="u-partner"
            value={v.partnerId}
            onChange={(e) => setV((o) => ({ ...o, partnerId: e.target.value }))}
            className={cell}
          >
            <option value="">Choose a partner…</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="mt-1.5 text-[11.5px] text-[var(--muted-soft)]">
            A partner login with no partner record attached would see an empty page.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mb-3 text-[13px] font-medium text-[var(--red-text)]">{error}</p>
      ) : null}
      {done ? (
        <p className="mb-3 text-[13px] font-medium text-[var(--green-text)]">
          {done} — pass the password on yourself; it is not stored anywhere readable.
        </p>
      ) : null}

      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          setDone(null);
          const result = await createUser({
            name: v.name,
            email: v.email,
            password: v.password,
            role: v.role,
            partnerId: v.partnerId || null,
          });
          setPending(false);
          if (!result.ok) return setError(result.error);
          setDone(`${v.email} created`);
          setV({ name: "", email: "", password: "", role: "EMPLOYEE", partnerId: "" });
          router.refresh();
        }}
        className={primary}
      >
        {pending ? "Creating…" : "Create account"}
      </button>
    </div>
  );
}

const ROLE_TONE: Record<Role, string> = {
  ADMIN: "bg-[var(--orange-soft)] text-[var(--orange-text)]",
  EMPLOYEE: "bg-[var(--navy-soft)] text-[var(--navy)]",
  INSTALLER: "bg-[var(--green-soft)] text-[var(--green-text)]",
  PARTNER: "bg-[var(--chip-soft)] text-[var(--chip-text)]",
};

export function UserList({
  users,
  partners,
}: {
  users: UserRow[];
  partners: PartnerOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ role: Role; partnerId: string }>({
    role: "EMPLOYEE",
    partnerId: "",
  });

  async function apply(userId: string) {
    setBusy(userId);
    setError(null);
    const result = await setUserRole(userId, draft.role, draft.partnerId || null);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setEditing(null);
    router.refresh();
  }

  return (
    <div>
      <div className="overflow-hidden rounded-[9px] border border-[var(--line)]">
        {users.map((u, i) => (
          <div
            key={u.id}
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 ${
              i < users.length - 1 ? "border-b border-[var(--line-soft)]" : ""
            }`}
          >
            <span className="min-w-40 flex-1">
              <span className="block text-[13.5px] font-semibold">
                {u.name}
                {u.isSelf ? (
                  <span className="ml-2 text-[11px] font-normal text-[var(--muted-soft)]">you</span>
                ) : null}
              </span>
              <span className="ref mt-0.5 block text-[11.5px] text-[var(--muted)]">{u.email}</span>
            </span>

            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.04em] uppercase ${
                ROLE_TONE[u.role]
              }`}
            >
              {u.role}
            </span>

            {u.partnerName ? (
              <span className="shrink-0 text-[12px] text-[var(--muted)]">{u.partnerName}</span>
            ) : null}

            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setEditing(editing === u.id ? null : u.id);
                setDraft({ role: u.role, partnerId: u.partnerId ?? "" });
                setError(null);
              }}
              className="h-9 shrink-0 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-bold text-[var(--navy)]"
            >
              {editing === u.id ? "Close" : "Change role"}
            </button>

            {editing === u.id ? (
              <div className="flex w-full flex-wrap items-end gap-2.5 border-t border-[var(--line-soft)] pt-3">
                <div className="min-w-40">
                  <label className={labelCls} htmlFor={`r-${u.id}`}>Role</label>
                  <select
                    id={`r-${u.id}`}
                    value={draft.role}
                    onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as Role }))}
                    className={cell}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                {draft.role === "PARTNER" ? (
                  <div className="min-w-44">
                    <label className={labelCls} htmlFor={`rp-${u.id}`}>Partner</label>
                    <select
                      id={`rp-${u.id}`}
                      value={draft.partnerId}
                      onChange={(e) => setDraft((d) => ({ ...d, partnerId: e.target.value }))}
                      className={cell}
                    >
                      <option value="">Choose…</option>
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void apply(u.id)}
                  className={primary}
                >
                  {busy === u.id ? "Saving…" : "Apply"}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--red-text)]">{error}</p>
      ) : null}
    </div>
  );
}
