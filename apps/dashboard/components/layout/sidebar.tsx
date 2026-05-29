"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OperionLogo } from "@/components/brand/operion-logo";
import { operionBrand } from "@/lib/brand/operion";
import { cn } from "@/lib/utils";
import { departmentNavGroups } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-primary/15 bg-black/65 backdrop-blur-2xl md:flex md:flex-col">
        <div className="border-b border-primary/15 px-5 py-6">
          <OperionLogo size="md" />
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {departmentNavGroups.map((group) => (
            <section key={group.key} className="space-y-1">
              <div className="px-3 pb-1">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">{group.label}</p>
                <p className="mt-1 line-clamp-2 text-[0.7rem] leading-4 text-muted-foreground">{group.purpose}</p>
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={`${group.key}-${item.label}`}
                    href={{ pathname: item.href }}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-primary/[0.08] hover:text-primary",
                      active && "bg-primary/12 text-primary ring-1 ring-primary/25"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge ? <span className="shrink-0 rounded-md border border-primary/20 px-1.5 py-0.5 text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">{item.badge}</span> : null}
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>
        <div className="border-t border-primary/15 p-4 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {operionBrand.tagline}
          <span className="mt-2 block normal-case tracking-normal">{operionBrand.descriptor}</span>
        </div>
      </aside>
      <nav className="sticky top-16 z-30 flex gap-2 overflow-x-auto border-b border-primary/15 bg-black/85 px-4 py-2 backdrop-blur md:hidden">
        {departmentNavGroups.map((group) => (
          <div key={group.key} className="flex shrink-0 items-center gap-2">
            <span className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-primary">{group.label}</span>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={`${group.key}-mobile-${item.label}`}
                  href={{ pathname: item.href }}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground",
                    active && "bg-primary/12 text-primary"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}
