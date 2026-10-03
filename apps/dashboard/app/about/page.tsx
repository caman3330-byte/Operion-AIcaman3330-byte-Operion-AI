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

        <MotionSection className="border-y border-sky-100 bg-sky-50/40 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-4">
            {principles.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm">
                  <Icon className="h-5 w-5 text-sky-600" />
                  <h2 className="mt-5 font-semibold text-slate-950">{item.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.text}</p>
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
            <div className="rounded-lg border border-sky-100 bg-white p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Secure", "Protected application and signed document access"],
                  ["Structured", "Clean data model for funding review"],
                  ["Scalable", "Ready for lender routing and funding qualification"]
                ].map(([title, text]) => (
                  <div key={title}>
                    <p className="text-lg font-semibold text-slate-950">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
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
