import Link from "next/link";
import { ArrowRight, CheckCircle2, LockKeyhole, Mail } from "lucide-react";
import { PublicShell } from "@/components/marketing/public-shell";
import { Button } from "@/components/ui/button";

export default function ThankYouPage() {
  return (
    <PublicShell>
      <main className="capital-cinematic px-4 py-20 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-4xl rounded-lg border border-primary/20 bg-black/35 p-8 text-center shadow-2xl shadow-black/25 sm:p-12">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-6 font-serif text-4xl font-medium tracking-normal text-white sm:text-5xl">
            Your funding request is in motion.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-muted-foreground">
            Operion Capital now operates through a secure application, signed document upload links, and direct funding-team
            communication. There is no merchant dashboard or portal login required.
          </p>
          <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
            {[
              [LockKeyhole, "Secure upload links", "Documents are handled through signed access only."],
              [Mail, "Email-driven updates", "Review and document requests are sent directly to your inbox."],
              [ArrowRight, "Lender connection", "Funding partners may contact qualified merchants directly."]
            ].map(([Icon, title, text]) => {
              const CardIcon = Icon as typeof LockKeyhole;
              return (
                <div key={String(title)} className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
                  <CardIcon className="h-5 w-5 text-primary" />
                  <p className="mt-4 text-sm font-semibold text-white">{title as string}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/apply">
                Start or update application
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/portal/upload">Open secure upload</Link>
            </Button>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">Support: support@operioncapital.com</p>
        </section>
      </main>
    </PublicShell>
  );
}
