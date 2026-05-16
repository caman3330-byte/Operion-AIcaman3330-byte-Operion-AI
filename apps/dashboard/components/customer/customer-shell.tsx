"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Bell, CreditCard, FileText, LayoutDashboard, Settings, UploadCloud } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const customerNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/application-status", label: "Application", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function CustomerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/10 bg-card/75 backdrop-blur-xl lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-sm font-black text-primary-foreground">
              OC
            </span>
            <span>
              <span className="block text-sm font-semibold text-white">Operion Capital</span>
              <span className="text-xs text-muted-foreground">Customer workspace</span>
            </span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {customerNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href as Route}
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
        <div className="p-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <UploadCloud className="h-4 w-4 text-primary" />
              Documents
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Upload recent statements to improve review readiness.</p>
            <Button asChild size="sm" className="mt-4 w-full">
              <Link href="/application-status">Review checklist</Link>
            </Button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-background/80 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center gap-2 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-black text-primary-foreground">
                OC
              </span>
              <span className="text-sm font-semibold text-white">Operion Capital</span>
            </Link>
            <nav className="hidden items-center gap-2 lg:flex">
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground">
                Secure customer portal
              </span>
            </nav>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Bell className="h-4 w-4" />
                Updates
              </Button>
              <Button variant="ghost" size="icon" aria-label="Funding account">
                <CreditCard className="h-4 w-4" />
              </Button>
              <LogoutButton />
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-2 lg:hidden">
            {customerNav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href as Route}
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
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
