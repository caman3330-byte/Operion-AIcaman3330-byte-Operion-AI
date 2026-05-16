import { ShieldCheck, Sparkles, Timer } from "lucide-react";
import { ApplicationForm } from "@/components/application/application-form";
import { PublicShell } from "@/components/marketing/public-shell";

export default function ApplyPage() {
  return (
    <PublicShell>
      <main className="px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <section className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.78fr_1.22fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              AI-assisted funding intake
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-normal text-white sm:text-5xl">
              Apply for business funding with a cleaner process.
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Share your business details once. Operion Capital prepares a structured funding profile for MCA, business loan,
              and lender matching review.
            </p>
            <div className="mt-8 grid gap-3">
              {[
                [ShieldCheck, "Secure intake", "Application data is handled through protected server-side workflows."],
                [Timer, "Fast review path", "Complete profiles are designed for quicker funding readiness review."],
                [Sparkles, "AI-assisted preparation", "Funding signals are structured for future qualification and matching."]
              ].map(([Icon, title, text]) => {
                const ItemIcon = Icon as typeof ShieldCheck;
                return (
                  <div key={String(title)} className="rounded-lg border border-white/10 bg-card/80 p-4">
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
