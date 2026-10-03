"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OperionLogo } from "@/components/brand/operion-logo";
import { operionBrand } from "@/lib/brand/operion";
import { cn } from "@/lib/utils";
import { departmentNavGroups, type DepartmentNavGroup, type DepartmentNavItem } from "./nav-items";

function isActive(pathname: string, item: DepartmentNavItem) {
  return !item.planned && (pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`)));
}

function NavigationGroup({ group, pathname }: { group: DepartmentNavGroup; pathname: string }) {
  const links = group.items.map((item) => {
    const Icon = item.icon;
    const content = <><span className="flex min-w-0 items-center gap-3"><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{item.label}</span></span>{item.planned ? <span className="text-[0.65rem] font-normal">Later phase</span> : null}</>;
    const className = "flex min-h-11 items-center justify-between gap-2 rounded-md px-3 py-2.5 text-sm font-medium";
    return item.planned
      ? <span key={item.label} aria-disabled="true" className={cn(className, "text-muted-foreground/60")}>{content}</span>
      : <Link key={item.label} href={{ pathname: item.href }} aria-current={isActive(pathname, item) ? "page" : undefined} className={cn(className, "text-muted-foreground hover:bg-primary/[0.08] hover:text-primary", isActive(pathname, item) && "bg-primary/12 text-primary ring-1 ring-primary/25")}>{content}</Link>;
  });
  if (group.collapsed) return <details open={group.items.some((item) => isActive(pathname, item)) || undefined} className="border-t border-border pt-4"><summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">{group.label}</summary><div className="mt-2 space-y-1">{links}</div></details>;
  return <section className="space-y-1"><p className="px-3 pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">{group.label}</p>{links}</section>;
}

export function Sidebar({ role }: { role?: string }) {
  const pathname = usePathname();
  const isFounder = ["founder", "admin", "super_admin"].includes(role ?? "");
  const groups = departmentNavGroups.filter((group) => !group.founderOnly || isFounder);
  return <>
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-border bg-card md:flex md:flex-col">
      <div className="border-b border-primary/15 px-5 py-6"><OperionLogo size="md" tone="light" /></div>
      <nav aria-label="Main navigation" className="flex-1 space-y-5 overflow-y-auto p-3">{groups.map((group) => <NavigationGroup key={group.key} group={group} pathname={pathname} />)}</nav>
      <div className="border-t border-primary/15 p-4 text-xs uppercase tracking-[0.14em] text-muted-foreground">{operionBrand.tagline}</div>
    </aside>
    <details key={pathname} className="border-b border-primary/15 bg-background px-4 py-2 md:hidden">
      <summary className="cursor-pointer rounded-md px-2 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Navigation</summary>
      <nav aria-label="Mobile dashboard navigation" className="grid gap-5 py-3">{groups.map((group) => <NavigationGroup key={group.key} group={group} pathname={pathname} />)}</nav>
    </details>
  </>;
}
