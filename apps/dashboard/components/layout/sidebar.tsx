"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OperionLogo } from "@/components/brand/operion-logo";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-80 border-r border-primary/15 bg-black/50 backdrop-blur-2xl md:flex md:flex-col">
        <div className="border-b border-primary/15 px-6 py-7">
          <OperionLogo size="md" />
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={{ pathname: item.href }}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3.5 py-3 text-sm font-medium text-muted-foreground transition hover:bg-primary/[0.08] hover:text-primary",
                  active && "bg-primary/12 text-primary ring-1 ring-primary/25"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-primary/15 p-5 text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Private Capital Access
          <span className="mt-2 block normal-case tracking-normal">Funding operations, routing, and review systems</span>
        </div>
      </aside>
      <nav className="sticky top-16 z-30 flex gap-2 overflow-x-auto border-b border-primary/15 bg-black/85 px-4 py-2 backdrop-blur md:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
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
      </nav>
    </>
  );
}
