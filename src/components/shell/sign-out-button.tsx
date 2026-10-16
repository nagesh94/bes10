"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";

/**
 * `onChrome` is the version that sits in the dark app bar; `inSheet` is the
 * full-width row at the foot of the phone menu, where it is the only way out.
 * `compact` is the same row at the foot of the desktop rail, where it sits
 * next to other controls rather than alone; `iconOnly` is that row with the
 * rail narrowed to icons.
 */
export function SignOutButton({
  label,
  onChrome = false,
  inSheet = false,
  compact = false,
  iconOnly = false,
}: {
  label: string;
  onChrome?: boolean;
  inSheet?: boolean;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOut();
          router.push("/login");
          router.refresh();
        })
      }
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={
        iconOnly
          ? "flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-[var(--chrome-muted)] hover:bg-[var(--chrome-2)] hover:text-[var(--chrome-ink)] disabled:opacity-60"
          : compact
          ? "flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] px-3 text-[13px] font-semibold text-[var(--chrome-muted)] hover:bg-[var(--chrome-2)] hover:text-[var(--chrome-ink)] disabled:opacity-60"
          : inSheet
          ? "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px] font-medium text-[var(--chrome-muted)] hover:bg-[var(--chrome-2)] disabled:opacity-60"
          : onChrome
          ? "cursor-pointer rounded-[var(--radius-control)] border border-[var(--chrome-line)] px-3 py-[7px] text-[13px] font-semibold text-[var(--chrome-muted)] hover:bg-[var(--chrome-2)] hover:text-[var(--chrome-ink)] disabled:opacity-60"
          : "cursor-pointer rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)] disabled:opacity-60"
      }
    >
      {inSheet || compact || iconOnly ? (
        <LogOut size={iconOnly ? 17 : compact ? 17 : 19} strokeWidth={2} aria-hidden />
      ) : null}
      {iconOnly ? null : label}
    </button>
  );
}
