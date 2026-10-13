"use client";

import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED = "bhim_install_dismissed";

/**
 * Registers the service worker and, where the browser offers it, the prompt
 * to install.
 *
 * The worker is only registered in a production build: in development the
 * build assets it would cache change on every keystroke.
 */
export function Pwa() {
  const [installer, setInstaller] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // An unregistered worker costs the offline page, nothing else.
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    function onPrompt(event: Event) {
      event.preventDefault();
      try {
        if (localStorage.getItem(DISMISSED) === "1") return;
      } catch {
        // Blocked storage: show it. Worst case it is offered twice.
      }
      setInstaller(event as InstallEvent);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!installer) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Nothing to do; it simply gets offered again next time.
    }
    setInstaller(null);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:left-auto md:w-[380px] md:pr-5 md:pb-5">
      <div className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--chrome-line)] bg-[var(--chrome)] px-3.5 py-3 shadow-[var(--shadow-float)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={38} height={38} className="rounded-[7px]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-[var(--chrome-ink)]">
            Add BHIM CRM to your home screen
          </p>
          <p className="text-[12.5px] text-[var(--chrome-muted)]">Opens full screen, works offline</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void installer.prompt();
            void installer.userChoice.finally(() => setInstaller(null));
          }}
          className="h-10 shrink-0 cursor-pointer rounded-[var(--radius-control)] bg-[var(--orange)] px-3.5 text-[13.5px] font-bold text-[var(--orange-ink)]"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          className="h-10 w-8 shrink-0 cursor-pointer text-[18px] leading-none text-[var(--chrome-muted)] hover:text-[var(--chrome-ink)]"
        >
          ×
        </button>
      </div>
    </div>
  );
}
