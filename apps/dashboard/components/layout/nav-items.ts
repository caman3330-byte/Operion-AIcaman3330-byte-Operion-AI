import {
  Activity,
  BadgeDollarSign,
  Bot,
  BrainCircuit,
  Building2,
  ClipboardList,
  DatabaseZap,
  FileBarChart,
  FileSpreadsheet,
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
  planned?: boolean;
}

export interface DepartmentNavGroup {
  key: string;
  label: string;
  purpose: string;
  items: DepartmentNavItem[];
  collapsed?: boolean;
  founderOnly?: boolean;
}

export const departmentNavGroups: DepartmentNavGroup[] = [
  {
    key: "data",
    label: "Data",
    purpose: "Businesses before qualification",
    founderOnly: true,
    items: [
      { href: "/data", label: "AI Acquired", icon: DatabaseZap, exact: true },
      { href: "/data/manual-upload", label: "Manual Upload", icon: FileSpreadsheet }
    ]
  },
  {
    key: "sales-workflow",
    label: "Sales workflow",
    purpose: "",
    items: [
      { href: "/leads", label: "Leads", icon: ClipboardList },
      { href: "", label: "Gmail Outreach", icon: Mail, planned: true },
      { href: "", label: "Contacts", icon: Building2, planned: true },
      { href: "", label: "Lender Outreach", icon: Mail, planned: true }
    ]
  },
  {
    key: "operations-tools",
    label: "Operations & administration",
    purpose: "Existing tools and platform controls",
    collapsed: true,
    items: [
      { href: "/acquisition", label: "Acquisition review", icon: Search },
      { href: "/merchant-intelligence", label: "Intelligence", icon: BrainCircuit },
      { href: "/merchant-acquisition", label: "Funnel", icon: Activity },
      { href: "/merchant-sources", label: "Sources", icon: DatabaseZap },
      { href: "/merchants", label: "Merchants", icon: BadgeDollarSign },
      { href: "/outreach", label: "Existing outreach tools", icon: Mail },
      { href: "/lenders", label: "Lenders", icon: Building2 },
      { href: "/lender-discovery", label: "Lender discovery", icon: Radar },
      { href: "/supervisor", label: "Command Center", icon: Gauge, exact: true },
      { href: "/autonomous-operations", label: "Autonomy", icon: Bot },
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

export const navItems = departmentNavGroups.flatMap((group) => group.items).filter((item) => !item.planned);
