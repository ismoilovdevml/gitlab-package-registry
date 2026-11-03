import {
  LayoutDashboard,
  Package,
  Rows3,
  Search,
  Upload,
  Code2,
  ShieldCheck,
  Trash2,
  ScrollText,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { routes } from "@/lib/routes";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  adminOnly?: boolean;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Registry",
    items: [
      { label: "Overview", href: routes.dashboard, icon: LayoutDashboard },
      { label: "Packages", href: routes.packages, icon: Package },
      { label: "Repositories", href: routes.repositories, icon: Rows3 },
      { label: "Search", href: routes.search(), icon: Search },
      { label: "Publish", href: routes.publish, icon: Upload },
      { label: "Client setup", href: routes.clientSetup, icon: Code2 },
    ],
  },
  {
    title: "Governance",
    items: [
      { label: "Security", href: routes.security, icon: ShieldCheck },
      { label: "Cleanup policies", href: routes.cleanup, icon: Trash2 },
      { label: "Audit log", href: routes.audit, icon: ScrollText },
    ],
  },
  {
    title: "Admin",
    adminOnly: true,
    items: [
      { label: "Users & access", href: routes.users, icon: Users },
      { label: "Settings", href: routes.settings, icon: Settings },
    ],
  },
];
