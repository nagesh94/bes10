import { notFound } from "next/navigation";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor || !can(actor, "admin.users")) notFound();

  return (
    <>
      <AdminTabs />
      {children}
    </>
  );
}
