import { redirect } from "next/navigation";
import { AppHeader } from "@/components/shell/app-header";
import { ConfirmProvider } from "@/components/shell/confirm";
import { InstallerHeader } from "@/components/shell/installer-header";
import { isOnly } from "@/lib/rbac/permissions";
import { getActor, getCurrentUser } from "@/lib/session";

/**
 * Everything behind sign-in. The check is here rather than in middleware so
 * it runs against the database session, not just the presence of a cookie —
 * a deactivated account is turned away even while its cookie is still valid.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [actor, user] = await Promise.all([getActor(), getCurrentUser()]);
  const record = user as { active?: boolean; name: string } | null;
  if (record && record.active === false) redirect("/login?inactive=1");
  if (!actor || !user) redirect("/login");

  // An installer gets a different shell, not a narrower version of this one:
  // no nav, a phone-sized bar, and nothing on screen they cannot act on.
  //
  // Only when installer is the whole of the account, though. Someone who is
  // an executive as well has office work to do and needs the nav to do it;
  // their job list is a link in that nav like any other page.
  if (isOnly(actor, "INSTALLER")) {
    return (
      <ConfirmProvider>
        <div className="min-h-screen bg-[var(--bg)]">
          <InstallerHeader name={user.name} />
          {children}
        </div>
      </ConfirmProvider>
    );
  }

  // The padding below is the phone's tab bar: without it the last row of a
  // table sits underneath the bar and cannot be read.
  // The confirmation dialog is mounted once, here, for both shells: a
  // technician deleting a photo on a phone gets the same panel as the office.
  return (
    <ConfirmProvider>
      <div className="min-h-screen bg-[var(--bg)] pb-[calc(58px+env(safe-area-inset-bottom))] md:pb-0">
        <AppHeader actor={actor} name={user.name} />
        {children}
      </div>
    </ConfirmProvider>
  );
}
