"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/10 bg-card/80 backdrop-blur-xl md:flex md:flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-sm font-semibold text-primary">Operion AI</p>
          <p className="mt-1 text-xs text-muted-foreground">Internal operator platform</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={{ pathname: item.href }}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-white/[0.06] hover:text-white",
                  active && "bg-primary/12 text-primary ring-1 ring-primary/20"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4 text-xs text-muted-foreground">
          Internal command center
          <span className="mt-1 block">Qualification, routing, and underwriting</span>
        </div>
      </aside>
      <nav className="sticky top-16 z-30 flex gap-2 overflow-x-auto border-b border-white/10 bg-card/90 px-4 py-2 backdrop-blur md:hidden">
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
