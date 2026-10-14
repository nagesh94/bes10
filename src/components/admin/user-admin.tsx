"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  inviteUser,
  resetUserPassword,
  setUserActive,
  updateUser,
} from "@/app/actions/admin-users";
import { PasswordInput } from "@/components/shell/password-input";
import { ROLE_CHIP, ROLE_CHIP_LABEL } from "@/lib/admin/role-copy";
import { ROLES, type Role } from "@/lib/rbac/roles";

const cell =
  "h-11 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const passwordCell =
  "h-11 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] pl-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";
const primary =
  "h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60";
const quiet =
  "h-9 shrink-0 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-bold text-[var(--navy)] disabled:opacity-60";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Ambiguous characters are left out: this gets read aloud down a phone. */
function suggestPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export interface PartnerOption {
  id: string;
  name: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  phone: string | null;
  active: boolean;
  partnerId: string | null;
  partnerName: string | null;
  isSelf: boolean;
  createdAt: string;
}

function Err({ name, errors }: { name: string; errors: Record<string, string[]> }) {
  const messages = errors[name];
  if (!messages?.length) return null;
  return <p className="mt-1 text-xs font-medium text-[var(--red-text)]">{messages[0]}</p>;
}

/**
 * The role picker: checkboxes, because an account holds a set.
 *
 * Nothing here is mutually exclusive. Roles only ever add — see the note in
 * `lib/rbac/permissions.ts` — so an installer who is also an executive is a
 * person with both lists, not a contradiction to resolve.
 */
function RolePicker({
  value,
  onChange,
  idPrefix,
  disabled,
}: {
  value: Role[];
  onChange: (next: Role[]) => void;
  idPrefix: string;
  disabled?: Role[];
}) {
  function toggle(role: Role) {
    onChange(value.includes(role) ? value.filter((r) => r !== role) : [...value, role]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ROLES.map((r) => {
        const on = value.includes(r.value);
        const locked = disabled?.includes(r.value) ?? false;
        return (
          <label
            key={r.value}
            className={`flex max-w-[260px] cursor-pointer items-start gap-2.5 rounded-lg px-3.5 py-2.5 ${
              on
                ? "bg-[var(--navy)] text-[var(--navy-ink)]"
                : "border border-[var(--line)] bg-[var(--surface)]"
            } ${locked ? "cursor-not-allowed opacity-70" : ""}`}
          >
            <input
              type="checkbox"
              id={`${idPrefix}-${r.value}`}
              checked={on}
              disabled={locked}
              onChange={() => toggle(r.value)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--orange)]"
            />
            <span>
              <span className="block text-[13px] font-bold">{r.label}</span>
              <span
                className={`mt-0.5 block text-[11px] ${
                  on ? "opacity-75" : "text-[var(--muted)]"
                }`}
              >
                {r.note}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function PartnerPicker({
  id,
  value,
  partners,
  onChange,
  errors,
}: {
  id: string;
  value: string;
  partners: PartnerOption[];
  onChange: (next: string) => void;
  errors: Record<string, string[]>;
}) {
  return (
    <div className="mt-4 max-w-sm">
      <label className={labelCls} htmlFor={id}>
        Which partner?
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cell}>
        <option value="">Choose a partner…</option>
        {partners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Err name="partnerId" errors={errors} />
      <p className="mt-1.5 text-[11.5px] text-[var(--muted-soft)]">
        A partner login with no partner record attached would see an empty page.
      </p>
    </div>
  );
}

/**
 * The password row.
 *
 * It sits on its own line rather than as a fourth cell beside Name, Email and
 * Phone. A generated password is fourteen monospace characters and will not
 * read in a 190px column, and the header carries an action the other fields
 * do not — crammed into the row it wrapped to two lines and dropped its own
 * input below its neighbours'. The reveal control is inside the box, so the
 * header is a label and one action, on one line.
 */
function PasswordField({
  id,
  value,
  onChange,
  label,
  hint,
  placeholder,
  errors,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  label: string;
  hint?: string;
  placeholder?: string;
  errors: Record<string, string[]>;
}) {
  const [revealToken, setRevealToken] = useState(0);

  return (
    <div className="max-w-md">
      <div className="mb-1.5 flex items-baseline justify-between gap-4">
        <label className="text-xs font-semibold text-[var(--muted)]" htmlFor={id}>
          {label}
        </label>
        <button
          type="button"
          onClick={() => {
            onChange(suggestPassword());
            setRevealToken((n) => n + 1);
          }}
          className="shrink-0 cursor-pointer text-xs font-semibold text-[var(--link)]"
        >
          Suggest one
        </button>
      </div>
      <PasswordInput
        id={id}
        autoComplete="new-password"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        showLabel="Show password"
        hideLabel="Hide password"
        revealToken={revealToken}
        className={`${passwordCell} ref`}
      />
      <Err name="password" errors={errors} />
      {hint ? <p className="mt-1.5 text-[11.5px] text-[var(--muted-soft)]">{hint}</p> : null}
    </div>
  );
}

const EMPTY_DRAFT = {
  name: "",
  email: "",
  phone: "",
  password: "",
  roles: ["EMPLOYEE"] as Role[],
  partnerId: "",
};

/**
 * Creates an account.
 *
 * The password is typed here once and hashed on the server; this app never
 * stores it in any readable form. Whoever creates the account passes it on
 * out of band, which is why it is shown back once on success.
 */
export function CreateUser({ partners }: { partners: PartnerOption[] }) {
  const router = useRouter();
  const [v, setV] = useState(EMPTY_DRAFT);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    setErrors({});
    setDone(null);

    const result = await inviteUser({
      name: v.name,
      email: v.email,
      roles: v.roles,
      phone: v.phone,
      partnerId: v.partnerId || null,
      password: v.password,
    });

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setErrors(result.fieldErrors ?? {});
      return;
    }
    setDone({ email: v.email.trim().toLowerCase(), password: v.password });
    setV(EMPTY_DRAFT);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <div>
          <label className={labelCls} htmlFor="u-name">
            Name
          </label>
          <input
            id="u-name"
            value={v.name}
            onChange={(e) => setV((o) => ({ ...o, name: e.target.value }))}
            placeholder="Priya Sharma"
            className={cell}
          />
          <Err name="name" errors={errors} />
        </div>
        <div>
          <label className={labelCls} htmlFor="u-email">
            Email
          </label>
          <input
            id="u-email"
            type="email"
            value={v.email}
            onChange={(e) => setV((o) => ({ ...o, email: e.target.value }))}
            placeholder="priya@bhimenergy.in"
            className={cell}
          />
          <Err name="email" errors={errors} />
        </div>
        <div>
          <label className={labelCls} htmlFor="u-phone">
            Phone
          </label>
          <input
            id="u-phone"
            inputMode="tel"
            value={v.phone}
            onChange={(e) => setV((o) => ({ ...o, phone: e.target.value }))}
            placeholder="98765 43210"
            className={`${cell} ref`}
          />
          <Err name="phone" errors={errors} />
        </div>
      </div>

      <div className="mb-4">
        <PasswordField
          id="u-pass"
          label="Temporary password"
          placeholder="at least 10 characters"
          hint="Shown once after you create the account. Give it to them directly."
          value={v.password}
          onChange={(password) => setV((o) => ({ ...o, password }))}
          errors={errors}
        />
      </div>

      <div className="mb-4">
        <div className={labelCls}>Roles — tick as many as apply</div>
        <RolePicker
          idPrefix="u-role"
          value={v.roles}
          onChange={(roles) => setV((o) => ({ ...o, roles }))}
        />
        <Err name="roles" errors={errors} />
      </div>

      {v.roles.includes("PARTNER") ? (
        <PartnerPicker
          id="u-partner"
          value={v.partnerId}
          partners={partners}
          onChange={(partnerId) => setV((o) => ({ ...o, partnerId }))}
          errors={errors}
        />
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 mb-3 text-[13px] font-medium text-[var(--red-text)]">
          {error}
        </p>
      ) : null}
      {done ? (
        <div className="mt-3 mb-3 rounded-lg border border-[var(--green-border)] bg-[var(--green-soft)] px-3.5 py-3 text-[13px] text-[var(--green-text)]">
          <p className="m-0 font-semibold">{done.email} created.</p>
          <p className="mt-1 mb-0">
            Password, shown once: <span className="ref font-semibold">{done.password}</span> — pass
            it on yourself; it is not stored anywhere readable.
          </p>
        </div>
      ) : null}

      <button type="button" disabled={pending} onClick={() => void submit()} className={`${primary} mt-4`}>
        {pending ? "Creating…" : "Create account"}
      </button>
    </div>
  );
}

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
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    phone: "",
    roles: [] as Role[],
    partnerId: "",
    active: true,
    password: "",
  });

  function open(row: UserRow) {
    setEditing(editing === row.id ? null : row.id);
    setDraft({
      name: row.name,
      phone: row.phone ?? "",
      roles: row.roles,
      partnerId: row.partnerId ?? "",
      active: row.active,
      password: "",
    });
    setError(null);
    setErrors({});
    setNotice(null);
  }

  async function save(row: UserRow) {
    setBusy(row.id);
    setError(null);
    setErrors({});
    setNotice(null);

    const result = await updateUser({
      id: row.id,
      name: draft.name,
      roles: draft.roles,
      phone: draft.phone,
      partnerId: draft.partnerId || null,
      active: draft.active,
      password: draft.password || "",
    });

    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      setErrors(result.fieldErrors ?? {});
      return;
    }
    if (draft.password) setNotice(`Password changed for ${row.email}. Pass it on yourself.`);
    setEditing(null);
    router.refresh();
  }

  async function toggleActive(row: UserRow) {
    setBusy(row.id);
    setError(null);
    setNotice(null);
    const result = await setUserActive({ id: row.id, active: !row.active });
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  /** The common case on a phone call: one new password, nothing else changed. */
  async function resetOnly(row: UserRow) {
    const password = suggestPassword();
    setBusy(row.id);
    setError(null);
    setNotice(null);
    const result = await resetUserPassword({ id: row.id, password });
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setNotice(`New password for ${row.email}: ${password} — shown once, read it out now.`);
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
            } ${u.active ? "" : "bg-[var(--surface-2)]"}`}
          >
            <span className="min-w-40 flex-1">
              <span className="block text-[13.5px] font-semibold">
                <span className={u.active ? "" : "text-[var(--muted)]"}>{u.name}</span>
                {u.isSelf ? (
                  <span className="ml-2 text-[11px] font-normal text-[var(--muted-soft)]">you</span>
                ) : null}
                {u.active ? null : (
                  <span className="ml-2 rounded-full bg-[var(--red-surface)] px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] text-[var(--red-text)] uppercase">
                    disabled
                  </span>
                )}
              </span>
              <span className="ref mt-0.5 block text-[11.5px] text-[var(--muted)]">{u.email}</span>
            </span>

            <span className="flex shrink-0 flex-wrap gap-1.5">
              {u.roles.map((role) => (
                <span
                  key={role}
                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.04em] uppercase ${ROLE_CHIP[role]}`}
                >
                  {ROLE_CHIP_LABEL[role]}
                </span>
              ))}
            </span>

            {u.partnerName ? (
              <span className="shrink-0 text-[12px] text-[var(--muted)]">{u.partnerName}</span>
            ) : null}

            <button type="button" disabled={busy !== null} onClick={() => open(u)} className={quiet}>
              {editing === u.id ? "Close" : "Edit"}
            </button>

            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void resetOnly(u)}
              className={quiet}
            >
              Reset password
            </button>

            <button
              type="button"
              disabled={busy !== null || u.isSelf}
              title={u.isSelf ? "You cannot disable your own account." : undefined}
              onClick={() => void toggleActive(u)}
              className={`${quiet} ${
                u.active ? "text-[var(--red-text)]" : "text-[var(--green-text)]"
              }`}
            >
              {u.active ? "Disable" : "Enable"}
            </button>

            {editing === u.id ? (
              <div className="w-full border-t border-[var(--line-soft)] pt-3.5">
                <div className="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
                  <div>
                    <label className={labelCls} htmlFor={`n-${u.id}`}>
                      Name
                    </label>
                    <input
                      id={`n-${u.id}`}
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      className={cell}
                    />
                    <Err name="name" errors={errors} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor={`p-${u.id}`}>
                      Phone
                    </label>
                    <input
                      id={`p-${u.id}`}
                      inputMode="tel"
                      value={draft.phone}
                      onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                      className={`${cell} ref`}
                    />
                    <Err name="phone" errors={errors} />
                  </div>
                </div>

                <div className="mb-3.5">
                  <PasswordField
                    id={`pw-${u.id}`}
                    label="New password"
                    placeholder="leave blank to keep the current one"
                    value={draft.password}
                    onChange={(password) => setDraft((d) => ({ ...d, password }))}
                    errors={errors}
                  />
                </div>

                <div className="mb-3.5">
                  <div className={labelCls}>Roles</div>
                  <RolePicker
                    idPrefix={`r-${u.id}`}
                    value={draft.roles}
                    onChange={(roles) => setDraft((d) => ({ ...d, roles }))}
                    disabled={u.isSelf ? ["ADMIN"] : undefined}
                  />
                  <Err name="roles" errors={errors} />
                  {u.isSelf ? (
                    <p className="mt-1.5 text-[11.5px] text-[var(--muted-soft)]">
                      Your own admin role is fixed here — another admin can change it for you.
                    </p>
                  ) : null}
                </div>

                {draft.roles.includes("PARTNER") ? (
                  <PartnerPicker
                    id={`rp-${u.id}`}
                    value={draft.partnerId}
                    partners={partners}
                    onChange={(partnerId) => setDraft((d) => ({ ...d, partnerId }))}
                    errors={errors}
                  />
                ) : null}

                <label className="mt-3.5 mb-3.5 flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    disabled={u.isSelf}
                    onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
                    className="h-4 w-4 accent-[var(--orange)]"
                  />
                  Account can sign in
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void save(u)}
                    className={primary}
                  >
                    {busy === u.id ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--red-text)]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 rounded-lg border border-[var(--green-border)] bg-[var(--green-soft)] px-3.5 py-3 text-[13px] font-medium text-[var(--green-text)]">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
