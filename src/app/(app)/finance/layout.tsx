import { Suspense } from "react";
import { notFound } from "next/navigation";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Every finance tab is money from top to bottom, so the whole section is
 * closed at the layout rather than page by page. Each page still reads its
 * figures through `loadLedger`, which asserts `money.read` on its own.
 */
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor || !canSeeMoney(actor.roles)) notFound();

  return (
    <>
      <Suspense fallback={<div className="h-[46px] border-b border-[var(--line)] bg-[var(--surface)]" />}>
        <FinanceTabs />
      </Suspense>
      {children}
    </>
  );
}
