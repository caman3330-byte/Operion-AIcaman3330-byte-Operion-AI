import {
  BadgeDollarSign,
  ClipboardList,
  FileBarChart,
  Gauge,
  Mail,
  PenLine,
  Search,
  ShieldCheck
} from "lucide-react";

export const navItems = [
  { href: "/supervisor", label: "Command Center", icon: Gauge },
  { href: "/acquisition", label: "Lead Sources", icon: Search },
  { href: "/leads", label: "Leads", icon: ClipboardList },
  { href: "/lenders", label: "Lenders", icon: BadgeDollarSign },
  { href: "/outreach", label: "Outreach", icon: Mail },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/audit", label: "Audit", icon: ShieldCheck },
  { href: "/prompts", label: "AI Prompts", icon: PenLine }
] as const;
