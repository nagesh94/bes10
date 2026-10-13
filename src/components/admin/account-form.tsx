"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { inviteUser, updateUser } from "@/app/actions/admin-users";
import { ROLE_LABEL } from "@/lib/admin/role-copy";
import { ROLES, type Role } from "@/lib/rbac/permissions";

const field =
  "h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function suggestPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export interface EditableUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  active: boolean;
  self: boolean;
}

function Err({ name, errors }: { name: string; errors: Record<string, string[]> }) {
  const messages = errors[name];
  if (!messages?.length) return null;
  return <p className="mt-1 text-xs font-medium text-[var(--red-text)]">{messages[0]}</p>;
}

export function InviteControl() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-[var(--orange)] px-[18px] text-sm font-bold text-[var(--orange-ink)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Invite user
      </button>
      {open ? (
        <div className="w-full basis-full">
          <AccountForm mode="invite" onClose={() => setOpen(false)} />
        </div>
      ) : null}
    </>
  );
}

export function AccountForm({
  mode,
  user,
  onClose,
}: {
  mode: "invite" | "edit";
  user?: EditableUser;
  onClose?: () => void;
}) {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError(null);
    setFieldErrors({});
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "");
    const email = String(data.get("email") ?? "");

    if (mode === "invite") {
      const result = await inviteUser({
        name,
        email,
        role: String(data.get("role") ?? "EMPLOYEE") as Role,
        phone: String(data.get("phone") ?? ""),
        password,
      });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        setPending(false);
        return;
      }
      setCreated({ name, email: email.toLowerCase(), password });
      form.reset();
      setPending(false);
      router.refresh();
      return;
    }

    if (!user) return;
    const result = await updateUser({
      id: user.id,
      name,
      role: String(data.get("role") ?? user.role) as Role,
      phone: String(data.get("phone") ?? ""),
      active: data.get("active") === "on",
      password,
    });
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      setPending(false);
      return;
    }
    setPending(false);
    router.push("/admin/users");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-5"
    >
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 className="m-0 text-[15px] font-bold">{mode === "invite" ? "Invite a person" : "Edit account"}</h2>
        <p className="m-0 text-[12.5px] text-[var(--muted)]">
          {mode === "invite"
            ? "They sign in with this email and password. Until they do, the account shows as invited."
            : user?.email}
        </p>
      </div>

      {created ? (
        <div className="mb-4 rounded-lg border border-[var(--green-border)] bg-[var(--green-soft)] px-3.5 py-3 text-[13px] text-[var(--green-text)]">
          <p className="m-0 font-semibold">Account created for {created.name}.</p>
          <p className="mt-1 mb-0">
            Sign-in password, shown once: <span className="ref font-semibold">{created.password}</span>
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="account-name">Name</label>
          <input id="account-name" name="name" defaultValue={user?.name} required className={field} />
          <Err name="name" errors={fieldErrors} />
        </div>
        <div>
          <label className={label} htmlFor="account-email">Email</label>
          <input
            id="account-email"
            name="email"
            type="email"
            defaultValue={user?.email}
            required={mode === "invite"}
            readOnly={mode === "edit"}
            className={`${field} ${mode === "edit" ? "text-[var(--muted)]" : ""}`}
          />
          <Err name="email" errors={fieldErrors} />
        </div>
        <div>
          <label className={label} htmlFor="account-role">Role</label>
          <select
            id="account-role"
            name="role"
            defaultValue={user?.role ?? "EMPLOYEE"}
            disabled={user?.self}
            className={field}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
          {user?.self ? <p className="mt-1 text-xs text-[var(--muted)]">Your own role stays admin.</p> : null}
        </div>
        <div>
          <label className={label} htmlFor="account-phone">Phone</label>
          <input id="account-phone" name="phone" defaultValue={user?.phone ?? ""} inputMode="tel" className={`${field} ref`} />
          <Err name="phone" errors={fieldErrors} />
        </div>
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className="text-xs font-semibold text-[var(--muted)]" htmlFor="account-password">
              {mode === "invite" ? "Password" : "New password"}
            </label>
            <button
              type="button"
              className="cursor-pointer text-xs font-semibold text-[var(--link)]"
              onClick={() => {
                if (passwordRef.current) passwordRef.current.value = suggestPassword();
              }}
            >
              Suggest one
            </button>
          </div>
          <input
            ref={passwordRef}
            id="account-password"
            name="password"
            type="text"
            autoComplete="new-password"
            required={mode === "invite"}
            placeholder={mode === "edit" ? "Leave blank to keep the current password" : undefined}
            className={`${field} ref`}
          />
          <Err name="password" errors={fieldErrors} />
        </div>
        {mode === "edit" && user && !user.self ? (
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" name="active" defaultChecked={user.active} className="h-4 w-4 accent-[var(--orange)]" />
            Account can sign in
          </label>
        ) : null}
        {mode === "edit" && user?.self ? <input type="hidden" name="active" value="on" /> : null}
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-[var(--red-text)]">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-4 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending ? "Saving…" : mode === "invite" ? "Create account" : "Save"}
        </button>
        {mode === "edit" ? (
          <a
            href="/admin/users"
            className="inline-flex h-11 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] no-underline"
          >
            Cancel
          </a>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)]"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
