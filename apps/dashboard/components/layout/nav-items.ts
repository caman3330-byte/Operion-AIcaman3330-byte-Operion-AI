import {
  Activity,
  BadgeDollarSign,
  Bot,
  ClipboardList,
  FileBarChart,
  FileText,
  Gauge,
  type LucideIcon,
  Mail,
  PenLine,
  Route,
  Search,
  ShieldCheck,
  TimerReset
} from "lucide-react";

export interface DepartmentNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  exact?: boolean;
}

export interface DepartmentNavGroup {
  key: string;
  label: string;
  purpose: string;
  items: DepartmentNavItem[];
}

export const departmentNavGroups: DepartmentNavGroup[] = [
  {
    key: "merchant-operations",
    label: "Merchant Operations",
    purpose: "Merchant acquisition, document collection, underwriting preparation, and deal lifecycle.",
    items: [
      { href: "/acquisition", label: "Lead Sources", icon: Search },
      { href: "/leads", label: "Leads", icon: ClipboardList },
      { href: "/merchants", label: "Merchants", icon: BadgeDollarSign },
      { href: "/merchants", label: "Documents", icon: FileText, badge: "via merchants" },
      { href: "/supervisor/ai-agents", label: "Underwriting", icon: Activity, badge: "review" },
      { href: "/reports", label: "Funding Pipeline", icon: Route, badge: "reports" }
    ]
  },
  {
    key: "lender-operations",
    label: "Lender Operations",
    purpose: "Lender acquisition, enrichment, relationship management, and future lender matching.",
    items: [
      { href: "/lenders", label: "Lenders", icon: BadgeDollarSign },
      { href: "/lenders", label: "Lender Discovery", icon: Search, badge: "intelligence" },
      { href: "/lenders", label: "Lender Intelligence", icon: Bot, badge: "AI" },
      { href: "/outreach", label: "Outreach", icon: Mail },
      { href: "/lenders", label: "Partnerships", icon: ShieldCheck, badge: "review" }
    ]
  },
  {
    key: "executive-operations",
    label: "Executive Operations",
    purpose: "Executive visibility, operational control, auditability, and reliability monitoring.",
    items: [
      { href: "/admin", label: "Admin Cockpit", icon: Gauge, exact: true },
      { href: "/supervisor", label: "Supervisor", icon: Gauge },
      { href: "/supervisor/ai-operations", label: "Reliability Center", icon: Activity },
      { href: "/admin/ai", label: "AI Ops", icon: Bot },
      { href: "/prompts", label: "AI Prompts", icon: PenLine },
      { href: "/reports", label: "Reports", icon: FileBarChart },
      { href: "/audit", label: "Audit", icon: ShieldCheck },
      { href: "/admin/testing", label: "Testing", icon: TimerReset }
    ]
  }
] as const;

export const navItems = departmentNavGroups.flatMap((group) => group.items);
