import {
  Activity,
  BadgeDollarSign,
  Bot,
  BrainCircuit,
  Building2,
  ClipboardList,
  DatabaseZap,
  FileBarChart,
  Gauge,
  type LucideIcon,
  Mail,
  PenLine,
  Radar,
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
    key: "merchant-pipeline",
    label: "Merchant Pipeline",
    purpose: "Lead acquisition, qualification, merchant applications, and outreach campaigns.",
    items: [
      { href: "/acquisition", label: "Acquisition", icon: Search },
      { href: "/merchant-intelligence", label: "Intelligence", icon: BrainCircuit },
      { href: "/merchant-acquisition", label: "Funnel", icon: Activity },
      { href: "/merchant-sources", label: "Sources", icon: DatabaseZap },
      { href: "/leads", label: "Leads", icon: ClipboardList },
      { href: "/merchants", label: "Merchants", icon: BadgeDollarSign },
      { href: "/outreach", label: "Outreach", icon: Mail }
    ]
  },
  {
    key: "lender-operations",
    label: "Lender Operations",
    purpose: "Lender portfolio, criteria management, pricing, and relationship tracking.",
    items: [
      { href: "/lenders", label: "Lenders", icon: Building2 },
      { href: "/lender-discovery", label: "Discovery", icon: Radar }
    ]
  },
  {
    key: "platform-control",
    label: "Platform Control",
    purpose: "Operational command, AI monitoring, auditing, prompt management, and founder controls.",
    items: [
      { href: "/supervisor", label: "Command Center", icon: Gauge, exact: true },
      { href: "/founder-operations", label: "Founder Ops", icon: Activity },
      { href: "/supervisor/ai-agents", label: "Underwriting", icon: Activity },
      { href: "/supervisor/ai-operations", label: "AI Operations", icon: Bot },
      { href: "/manager-agent", label: "Manager Agent", icon: BrainCircuit },
      { href: "/reports", label: "Reports", icon: FileBarChart },
      { href: "/prompts", label: "AI Prompts", icon: PenLine },
      { href: "/audit", label: "Audit", icon: ShieldCheck },
      { href: "/testing", label: "Testing", icon: TimerReset }
    ]
  }
] as const;

export const navItems = departmentNavGroups.flatMap((group) => group.items);
