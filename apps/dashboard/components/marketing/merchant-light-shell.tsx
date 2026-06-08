import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { OperionMark } from "@/components/brand/operion-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/business-funding", label: "Funding" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" }
];

export function MerchantLightShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-screen bg-[#fbfaf7] text-[#15110a]", className)}>
      <MerchantLightHeader />
      {children}
      <MerchantLightFooter />
    </div>
  );
}

export function MerchantLightHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#d7b76a]/25 bg-white/95 backdrop-blur">
      <div className={cn("mx-auto flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8", compact ? "max-w-md" : "max-w-7xl")}>
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="Operion Capital home">
          <OperionMark className="h-9 w-9" />
          <span className={cn("min-w-0 whitespace-nowrap", compact && "hidden sm:block")}>
            <span className="block text-xs font-black uppercase tracking-[0.22em] text-[#15110a]">Operion Capital</span>
            {!compact ? <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9b7624]">Business Funding</span> : null}
          </span>
        </Link>
        {!compact ? (
          <nav className="hidden items-center gap-8 md:flex">
            {links.map((item) => (
              <Link key={item.href} href={item.href as Route} className="text-xs font-bold uppercase tracking-[0.2em] text-[#5c5140] transition hover:text-[#9b7624]">
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
        <Button asChild size="sm" className="bg-[#17130c] px-4 text-[#f8f5ec] hover:bg-[#2a2113]">
          <Link href="/apply?source=merchant-header">
            Apply
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}

export function MerchantLightFooter() {
  return (
    <footer className="border-t border-[#17130c]/10 bg-white px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <OperionMark className="h-9 w-9" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#15110a]">Operion Capital</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7624]">Private Capital Access</p>
          </div>
        </div>
        <p className="max-w-xl text-sm leading-6 text-[#635847]">
          Secure business funding intake with application-first onboarding, signed document upload, and human-reviewed funding options.
        </p>
      </div>
    </footer>
  );
}
