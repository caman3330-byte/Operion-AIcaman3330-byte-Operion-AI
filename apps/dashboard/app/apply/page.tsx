import { ShieldCheck, Sparkles, Timer } from "lucide-react";
import { ApplicationForm } from "@/components/application/application-form";
import { PublicShell } from "@/components/marketing/public-shell";

export default function ApplyPage() {
  return (
    <PublicShell>
      <main className="capital-cinematic px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <section className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.78fr_1.22fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-black/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Private funding intake
            </div>
            <h1 className="mt-6 font-serif text-4xl font-medium leading-tight tracking-normal text-white sm:text-5xl">
              Apply for private business funding without portal friction.
            </h1>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              Submit core business details and recent bank statements once. Operion Capital prepares a structured file for MCA,
              business funding analysis, and lender matching review.
            </p>
            <div className="mt-8 grid gap-3">
              {[
                [ShieldCheck, "Secure intake", "Applications and statements are handled through protected server-side workflows."],
                [Timer, "Fast review path", "Complete files are designed for quicker funding readiness review."],
                [Sparkles, "Email-driven updates", "No merchant login is required after submission."]
              ].map(([Icon, title, text]) => {
                const ItemIcon = Icon as typeof ShieldCheck;
                return (
                  <div key={String(title)} className="rounded-lg border border-primary/15 bg-black/30 p-4">
                    <div className="flex items-start gap-3">
                      <ItemIcon className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <p className="font-semibold text-white">{title as string}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{text as string}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <ApplicationForm />
        </section>
      </main>
    </PublicShell>
  );
}
