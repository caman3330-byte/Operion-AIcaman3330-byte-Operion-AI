import {
  Activity,
  BadgeDollarSign,
  Bot,
  ClipboardList,
  FileBarChart,
  Gauge,
  Mail,
  PenLine,
  Search,
  ShieldCheck,
  TimerReset
} from "lucide-react";

export const navItems = [
  { href: "/admin", label: "Admin", icon: Gauge },
  { href: "/admin/ai", label: "AI Ops", icon: Bot },
  { href: "/admin/testing", label: "Testing", icon: TimerReset },
  { href: "/supervisor", label: "Supervisor", icon: Gauge },
  { href: "/acquisition", label: "Lead Sources", icon: Search },
  { href: "/leads", label: "Leads", icon: ClipboardList },
  { href: "/merchants", label: "Merchants", icon: BadgeDollarSign },
  { href: "/lenders", label: "Lenders", icon: BadgeDollarSign },
  { href: "/outreach", label: "Outreach", icon: Mail },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/audit", label: "Audit", icon: ShieldCheck },
  { href: "/prompts", label: "AI Prompts", icon: PenLine }
] as const;
