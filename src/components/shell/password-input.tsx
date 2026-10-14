"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";

/**
 * A password box with the reveal control inside it.
 *
 * The toggle sits in the field rather than above it for two reasons. It is
 * where people look for it, and a header that carries a label *and* a control
 * is taller than a plain label — so a password box laid out beside ordinary
 * text boxes pushed its own input a line lower than theirs and bent the row.
 * Putting the control inside keeps every field in a row the same height.
 *
 * `className` must set its own left padding (`pl-*`, not `px-*`): the right
 * padding is this component's, and it has to clear the button.
 */
interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Spoken by a screen reader and shown on hover. Translated at the call site. */
  showLabel: string;
  hideLabel: string;
  /**
   * Bump this to reveal the field from outside — what "Suggest one" does,
   * since a generated password nobody can read is of no use to the person
   * about to read it down a phone. A counter rather than a boolean so the
   * caller can ask twice in a row and still be obeyed the second time.
   */
  revealToken?: number;
}

export function PasswordInput({
  showLabel,
  hideLabel,
  revealToken,
  className = "",
  ...input
}: PasswordInputProps) {
  const [shown, setShown] = useState(false);
  const label = shown ? hideLabel : showLabel;

  useEffect(() => {
    // Undefined on first render and wherever the caller does not use it, so
    // this never reveals a field on its own.
    if (revealToken !== undefined && revealToken > 0) setShown(true);
  }, [revealToken]);

  return (
    <div className="relative">
      <input {...input} type={shown ? "text" : "password"} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        // `aria-pressed` says the control is a toggle and which way it is set;
        // the label says what pressing it will do. Both are needed — a button
        // named "Show password" that is already showing it is a lie.
        aria-pressed={shown}
        aria-label={label}
        title={label}
        // Not a tab stop: tabbing from the password box should reach the next
        // field, not a control that only changes how the text is drawn. It is
        // still reachable by click, and by shift-tab for anyone who wants it.
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-[var(--muted)] hover:text-[var(--ink)]"
      >
        {shown ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}

function Eye() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.2 12S6 5.4 12 5.4 21.8 12 21.8 12 18 18.6 12 18.6 2.2 12 2.2 12Z" />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  );
}

/** The same eye with a stroke through it — the standard "hidden" counterpart. */
function EyeOff() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.9 5.6A9.6 9.6 0 0 1 12 5.4c6 0 9.8 6.6 9.8 6.6a18 18 0 0 1-2.4 3.3" />
      <path d="M6.5 6.9A17.6 17.6 0 0 0 2.2 12S6 18.6 12 18.6a9.4 9.4 0 0 0 3.6-.7" />
      <path d="M14.1 14.1a3.1 3.1 0 0 1-4.2-4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
