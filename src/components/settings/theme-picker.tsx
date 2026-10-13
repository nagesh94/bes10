"use client";

import { useEffect, useState, useTransition } from "react";
import { setTheme } from "@/app/actions/preferences";

type Theme = "system" | "light" | "dark";

const THEME_KEY = "bhim_theme";

/**
 * Applies the choice immediately, mirrors it to localStorage so the inline
 * script in the layout can paint the right theme before first render, and
 * saves it to the account so it follows the person to another device.
 *
 * "System" removes the attribute entirely rather than resolving it here —
 * the CSS already handles prefers-color-scheme, and resolving it in JS would
 * freeze the choice at page load instead of following the OS live.
 */
export function ThemePicker({ initial }: { initial: Theme }) {
  const [value, setValue] = useState<Theme>(initial);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const root = document.documentElement;
    if (value === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", value);
    try {
      if (value === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, value);
    } catch {
      // Private window or blocked storage — the account setting still holds.
    }
  }, [value]);

  function choose(next: Theme) {
    setValue(next);
    startTransition(() => {
      void setTheme(next);
    });
  }

  const options: Array<{ key: Theme; label: string; left: string; right: string }> = [
    { key: "system", label: "System", left: "#FFFFFF", right: "#07121F" },
    { key: "light", label: "Light", left: "#FFFFFF", right: "#FFFFFF" },
    { key: "dark", label: "Dark", left: "#07121F", right: "#07121F" },
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
            onClick={() => choose(o.key)}
            className={`flex flex-[1_1_200px] cursor-pointer flex-col gap-3 rounded-[10px] p-3.5 text-left ${
              on
                ? "bg-[var(--orange-soft)] ring-[1.5px] ring-[var(--orange)]"
                : "border border-[var(--line)] bg-[var(--surface)]"
            }`}
          >
            <span
              aria-hidden
              className="relative block h-[62px] overflow-hidden rounded-[7px] border border-[var(--line)]"
              style={{ background: `linear-gradient(to right, ${o.left} 50%, ${o.right} 50%)` }}
            >
              <span className="absolute top-[11px] right-[9px] left-[9px] h-[7px] rounded-sm bg-[#9FB2C8] opacity-55" />
              <span className="absolute bottom-[11px] left-[9px] h-[9px] w-[30px] rounded-[4px] bg-[var(--orange)]" />
            </span>
            <span className="flex items-center gap-2">
              <span
                className={`block h-4 w-4 shrink-0 rounded-full bg-[var(--surface)] ${
                  on ? "border-[5px] border-[var(--orange)]" : "border-[1.5px] border-[var(--line)]"
                }`}
              />
              <span className="text-sm font-semibold">{o.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
