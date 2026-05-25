import { Building2, ShieldCheck, Sparkles, Users } from "lucide-react";
import { MotionSection } from "@/components/marketing/motion-shell";
import { PublicShell } from "@/components/marketing/public-shell";
import { SectionHeading } from "@/components/marketing/section-heading";

const principles = [
  {
    title: "Business-first capital access",
    text: "Operion Capital is designed around the real operating needs of revenue-generating businesses.",
    icon: Building2
  },
  {
    title: "Private funding clarity",
    text: "We use intelligent software architecture to organize applications, reduce friction, and prepare stronger funding profiles.",
    icon: Sparkles
  },
  {
    title: "Trust by design",
    text: "Security, controlled access, and audit-friendly systems are core parts of the platform foundation.",
    icon: ShieldCheck
  },
  {
    title: "Human-reviewed outcomes",
    text: "The platform is built to assist funding review and lender matching while keeping final decisions accountable.",
    icon: Users
  }
];

export default function AboutPage() {
  return (
    <PublicShell>
      <main>
        <section className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="About Operion Capital"
              title="A modern funding platform for business owners who need speed and structure."
              description="Operion Capital brings premium fintech infrastructure, private funding analysis, and lender matching into a focused business funding experience."
            />
          </div>
        </section>

        <MotionSection className="border-y border-white/10 bg-white/[0.025] px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-4">
            {principles.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-lg border border-primary/15 bg-black/30 p-5">
                  <Icon className="h-5 w-5 text-primary" />
                  <h2 className="mt-5 font-semibold text-white">{item.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.text}</p>
                </div>
              );
            })}
          </div>
        </MotionSection>

        <MotionSection className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <SectionHeading
              eyebrow="Platform approach"
              title="Institutional process without unnecessary complexity."
              description="The launch foundation focuses on application quality, signed document upload, lender-readiness, email-driven merchant communication, and clean internal operational handoffs."
            />
            <div className="rounded-lg border border-primary/15 bg-black/30 p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Secure", "Protected application and signed document access"],
                  ["Structured", "Clean data model for funding review"],
                  ["Scalable", "Ready for lender routing and funding qualification"]
                ].map(([title, text]) => (
                  <div key={title}>
                    <p className="text-lg font-semibold text-white">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </MotionSection>
      </main>
    </PublicShell>
  );
}
