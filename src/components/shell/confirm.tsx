"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The app's one confirmation dialog.
 *
 * Everything destructive used to go through `window.confirm` followed by
 * `window.prompt` for the reason. That was two system dialogs stacked on one
 * decision: unstyled, unreadable on a phone, impossible to say "optional" in,
 * and silently suppressible by a browser — so a technician could tap Delete
 * and have nothing happen at all. This replaces both with one panel over a
 * dimmed screen, which is also the only way the reason field can explain
 * itself.
 *
 * It is a promise rather than a pile of state in every caller, so a handler
 * reads top to bottom as the decision it is:
 *
 *   const answer = await ask({ title: "Delete this photo?", tone: "danger" });
 *   if (!answer.confirmed) return;
 *
 * Built on the native `<dialog>`, which brings the things a hand-rolled
 * overlay gets wrong: it sits above everything regardless of what the page
 * has stacked, Escape closes it, focus is trapped inside it, and the rest of
 * the page is hidden from screen readers while it is open.
 */

export interface ConfirmRequest {
  /** The question. A question mark reads better than a command here. */
  title: string;
  /** What actually happens, in a sentence. Shown under the title. */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * `danger` paints the confirm button red and is the default, because
   * everything that asks for confirmation here is destroying something.
   */
  tone?: "danger" | "normal";
  /**
   * Ask for a reason as well. `required` holds the confirm button until
   * something is typed — for the decisions that have to be answerable later.
   */
  reason?: { label?: string; placeholder?: string; required?: boolean };
}

export interface ConfirmAnswer {
  confirmed: boolean;
  /** Trimmed, and undefined rather than empty when nothing was typed. */
  reason?: string;
}

type Ask = (request: ConfirmRequest) => Promise<ConfirmAnswer>;

const ConfirmContext = createContext<Ask | null>(null);

export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) {
    // A component asking for confirmation outside the app shell is a wiring
    // mistake, and a silent no-op would be the worst way to find out.
    throw new Error("useConfirm needs <ConfirmProvider>, which the app layout mounts.");
  }
  return ask;
}

const CANCELLED: ConfirmAnswer = { confirmed: false };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{
    request: ConfirmRequest;
    settle: (answer: ConfirmAnswer) => void;
  } | null>(null);
  const [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const ask = useCallback<Ask>(
    (request) =>
      new Promise<ConfirmAnswer>((resolve) => {
        setReason("");
        setPending((current) => {
          // Two overlapping questions should not strand the first caller
          // waiting on a promise that can never settle.
          current?.settle(CANCELLED);
          return { request, settle: resolve };
        });
      }),
    [],
  );

  // The element is always mounted so the ref is there to open; only its
  // contents come and go.
  useEffect(() => {
    const element = dialogRef.current;
    if (!element) return;
    if (pending && !element.open) element.showModal();
    else if (!pending && element.open) element.close();
  }, [pending]);

  function finish(confirmed: boolean) {
    if (!pending) return;
    const trimmed = reason.trim();
    pending.settle({
      confirmed,
      reason: confirmed && trimmed ? trimmed : undefined,
    });
    setPending(null);
  }

  const request = pending?.request;
  const danger = (request?.tone ?? "danger") === "danger";
  const blocked = Boolean(request?.reason?.required) && reason.trim().length === 0;

  return (
    <ConfirmContext.Provider value={ask}>
      {children}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={request?.body ? bodyId : undefined}
        // Escape fires `cancel`. Prevented so the close goes through the same
        // path as the buttons, which is what settles the promise.
        onCancel={(event) => {
          event.preventDefault();
          finish(false);
        }}
        // A click that lands on the element itself landed on ::backdrop —
        // the panel's own children stop it. Dismissing that way is a cancel.
        onClick={(event) => {
          if (event.target === dialogRef.current) finish(false);
        }}
        className="m-auto w-[calc(100vw-2rem)] max-w-[27rem] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-[var(--shadow-float)] backdrop:bg-[rgba(2,11,24,0.55)]"
      >
        {request ? (
          <div className="px-5 py-4.5">
            <h2 id={titleId} className="text-[16.5px] font-bold tracking-[-0.01em]">
              {request.title}
            </h2>

            {request.body ? (
              <p id={bodyId} className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
                {request.body}
              </p>
            ) : null}

            {request.reason ? (
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-[var(--muted)]">
                  {request.reason.label ??
                    (request.reason.required ? "Reason" : "Reason (optional)")}
                </span>
                <textarea
                  // The field is the reason this is a panel and not a system
                  // dialog, so it is what gets the focus.
                  autoFocus
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={request.reason.placeholder}
                  className="w-full resize-y rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[13.5px] text-[var(--ink)] outline-none focus:border-[var(--muted-soft)]"
                />
              </label>
            ) : null}

            <div className="mt-4.5 flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                // Focused by default on a dialog with no reason field: the
                // safe choice should be the one an impatient Enter takes.
                autoFocus={!request.reason}
                onClick={() => finish(false)}
                className="h-10 cursor-pointer rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 text-[13.5px] font-semibold text-[var(--ink)]"
              >
                {request.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                disabled={blocked}
                onClick={() => finish(true)}
                className={`h-10 cursor-pointer rounded-[var(--radius-control)] px-4 text-[13.5px] font-bold disabled:cursor-not-allowed disabled:opacity-55 ${
                  danger
                    ? "border border-[var(--red-border)] bg-[var(--red-surface)] text-[var(--red-text)]"
                    : "bg-[var(--orange)] text-[var(--orange-ink)]"
                }`}
              >
                {request.confirmLabel ?? (danger ? "Delete" : "Confirm")}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </ConfirmContext.Provider>
  );
}
