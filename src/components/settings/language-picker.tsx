"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setLocale } from "@/app/actions/preferences";

type Locale = "en" | "hi";

export function LanguagePicker({ initial }: { initial: Locale }) {
  const router = useRouter();
  const [value, setValue] = useState<Locale>(initial);
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === value) return;
    setValue(next);
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  const options: Array<{ key: Locale; title: string; sub: string; deva?: boolean }> = [
    { key: "en", title: "English", sub: "Default" },
    { key: "hi", title: "हिंदी", sub: "Hindi", deva: true },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            disabled={pending}
            onClick={() => choose(o.key)}
            className={`flex flex-[1_1_220px] cursor-pointer items-center gap-3 rounded-[10px] px-4 py-3.5 text-left disabled:opacity-70 ${
              on
                ? "bg-[var(--orange-soft)] ring-[1.5px] ring-[var(--orange)]"
                : "border border-[var(--line)] bg-[var(--surface)]"
            }`}
          >
            <span
              className={`block h-[18px] w-[18px] shrink-0 rounded-full bg-[var(--surface)] ${
                on ? "border-[5px] border-[var(--orange)]" : "border-[1.5px] border-[var(--line)]"
              }`}
            />
            <span>
              <span className={`block text-[15px] font-bold ${o.deva ? "font-deva" : ""}`}>
                {o.title}
              </span>
              <span className="mt-px block text-[12.5px] text-[var(--muted)]">{o.sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
