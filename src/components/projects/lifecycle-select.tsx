"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { setLifecycleStage } from "@/app/actions/lifecycle";

/**
 * The prospect / customer chip, as a dropdown for staff who may change it.
 * Styled like the read-only chip so the header looks the same either way.
 */
export function LifecycleSelect({
  projectId,
  value,
  className,
}: {
  projectId: string;
  value: "PROSPECT" | "CUSTOMER";
  className: string;
}) {
  const te = useTranslations("enums");
  const t = useTranslations("projects.c");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function change(next: "PROSPECT" | "CUSTOMER") {
    if (next === value) return;
    setPending(true);
    const result = await setLifecycleStage(projectId, next);
    setPending(false);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className={`relative inline-flex items-center rounded ${className}`}>
      <select
        aria-label={t("lifecycleLabel")}
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value as "PROSPECT" | "CUSTOMER")}
        className="cursor-pointer appearance-none bg-transparent py-0.5 pr-5 pl-1.5 text-[10px] font-bold tracking-[0.08em] uppercase outline-none disabled:opacity-60"
      >
        <option value="PROSPECT">{te("lifecycle.PROSPECT")}</option>
        <option value="CUSTOMER">{te("lifecycle.CUSTOMER")}</option>
      </select>
      <ChevronDown
        size={11}
        strokeWidth={3}
        aria-hidden
        className="pointer-events-none absolute right-1.5"
      />
    </span>
  );
}
