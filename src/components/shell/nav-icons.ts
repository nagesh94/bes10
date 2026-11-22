import {
  Calculator,
  FileSignature,
  FileStack,
  FileText,
  FolderOpen,
  Handshake,
  LayoutDashboard,
  Settings,
  Share2,
  ShieldCheck,
  BadgeCheck,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon per destination, shared by the phone's tab bar and the desktop
 * sidebar so the same page is the same glyph wherever it is reached from.
 */
export const NAV_ICON: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  projects: FolderOpen,
  quotations: FileText,
  agreements: FileSignature,
  finance: Wallet,
  estimates: Calculator,
  partners: Handshake,
  documents: FileStack,
  dcr: BadgeCheck,
  admin: ShieldCheck,
  myJobs: Wrench,
  myReferrals: Share2,
  settings: Settings,
};
