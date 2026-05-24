import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { OperionLogo } from "@/components/brand/operion-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const publicLinks = [
  { href: "/funding-solutions", label: "Solutions" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" }
];

export function PublicShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("fintech-shell min-h-screen text-foreground", className)}>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Operion Capital home">
            <OperionLogo />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {publicLinks.map((item) => (
              <Link key={item.href} href={item.href as Route} className="text-sm font-medium text-muted-foreground transition hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/signin">
                <LockKeyhole className="h-4 w-4" />
                Login
              </Link>
            </Button>
            <Button asChild>
              <Link href="/apply">
                Apply
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-white/10 bg-black/20 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <div className="flex items-center gap-3">
              <OperionLogo showTagline={false} />
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Intelligent capital access for modern businesses through secure applications, AI-assisted underwriting readiness,
              and lender matching infrastructure.
            </p>
          </div>
          <FooterGroup title="Platform" links={[["Apply", "/apply"], ["Funding Solutions", "/funding-solutions"], ["Status", "/application-status"]]} />
          <FooterGroup title="Company" links={[["About", "/about"], ["Contact", "/contact"], ["Login", "/login"]]} />
          <div>
            <p className="text-sm font-semibold text-white">Security</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Encrypted application intake, protected customer access, secure lender distribution, and signed-access document handling.
            </p>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-muted-foreground">
          <p>Copyright {new Date().getFullYear()} Operion Capital. All rights reserved.</p>
          <a href="https://operioncapital.com" className="hover:text-white">
            operioncapital.com
          </a>
        </div>
      </footer>
    </div>
  );
}

function FooterGroup({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="mt-3 grid gap-2">
        {links.map(([label, href]) => (
          <Link key={href} href={href as Route} className="text-sm text-muted-foreground transition hover:text-white">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
