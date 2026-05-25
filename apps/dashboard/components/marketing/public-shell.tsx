import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
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
      <header className="sticky top-0 z-40 border-b border-primary/15 bg-black/55 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-5 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center" aria-label="Operion Capital home">
            <OperionLogo size="sm" showTagline={false} collapseWordmarkOnMobile />
          </Link>
          <nav className="hidden items-center gap-10 md:flex">
            {publicLinks.map((item) => (
              <Link key={item.href} href={item.href as Route} className="relative text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground transition after:absolute after:-bottom-2 after:left-1/2 after:h-px after:w-0 after:-translate-x-1/2 after:bg-primary after:transition-all hover:text-primary hover:after:w-8">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="px-4">
              <Link href="/apply">
                Apply
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-primary/15 bg-black/35 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <div className="flex items-center gap-3">
              <OperionLogo size="md" />
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Private capital access for growth-focused businesses through secure applications, funding analysis, and lender matching infrastructure.
            </p>
          </div>
          <FooterGroup title="Platform" links={[["Apply", "/apply"], ["Secure Upload", "/portal/upload"], ["Funding Solutions", "/funding-solutions"]]} />
          <FooterGroup title="Company" links={[["About", "/about"], ["Contact", "/contact"]]} />
          <div>
            <p className="text-sm font-semibold text-white">Security</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Encrypted application intake, secure lender distribution, and signed-access document handling without account friction.
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
