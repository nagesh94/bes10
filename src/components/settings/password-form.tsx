"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

const field =
  "h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

export function PasswordForm() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(false);

    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirm = String(data.get("confirm") ?? "");

    if (newPassword.length < 10) {
      setError("A new password needs at least 10 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }

    setPending(true);
    const { error: authError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      // Everything else gets signed out — a password change should end any
      // session someone else might be holding.
      revokeOtherSessions: true,
    });
    setPending(false);

    if (authError) {
      setError("That current password is not right.");
      return;
    }
    setDone(true);
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3.5 border-t border-[var(--line-soft)] py-3.5">
        <div className="min-w-50 flex-1">
          <div className="text-sm font-semibold">Password</div>
          <div className="mt-0.5 text-[12.5px] text-[var(--muted)]">
            {done ? "Changed just now — other sessions were signed out." : "At least 10 characters."}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-semibold text-[var(--ink)]"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="border-t border-[var(--line-soft)] py-4">
      <div className="mb-3 text-sm font-semibold">Change password</div>
      <div className="grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="currentPassword">Current password</label>
          <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required className={field} />
        </div>
        <div>
          <label className={labelCls} htmlFor="newPassword">New password</label>
          <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required className={field} />
        </div>
        <div>
          <label className={labelCls} htmlFor="confirm">Confirm</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={field} />
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 max-w-lg rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2.5">
        <button
          type="submit"
          disabled={pending}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Update password"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--ink)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
