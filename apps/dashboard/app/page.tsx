import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  CheckCircle2,
  FileCheck2,
  Landmark,
  LockKeyhole,
  Network,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { MotionDiv, MotionSection } from "@/components/marketing/motion-shell";
import { OperionLogo } from "@/components/brand/operion-logo";
import { PublicShell } from "@/components/marketing/public-shell";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";

const stats = [
  { label: "Application time", value: "5 min" },
  { label: "Review window", value: "24-48h" },
  { label: "Funding range", value: "$10k-$500k" },
  { label: "Data security", value: "Encrypted" }
];

const process = [
  {
    title: "Apply securely",
    text: "Submit core business details, requested capital, contact information, and latest bank statements through an encrypted flow.",
    icon: FileCheck2
  },
  {
    title: "Funding analysis",
    text: "Operion structures your funding profile so required information is clear, complete, and ready for lender review.",
    icon: Sparkles
  },
  {
    title: "Match with lender paths",
    text: "Applications are prepared for lender routing based on funding product, requested amount, industry, and business profile.",
    icon: Network
  },
  {
    title: "Direct funding follow-up",
    text: "Review updates, document requests, and lender next steps are handled by email and direct specialist contact.",
    icon: CheckCircle2
  }
];

const faqs = [
  {
    q: "What funding products does Operion Capital support?",
    a: "The Phase 1 platform is built around MCA funding, business loans, lines of credit, and related working-capital products."
  },
  {
    q: "Is the application secure?",
    a: "Yes. The application architecture is designed around protected sessions, encrypted transport, server-side processing, and restricted database access."
  },
  {
    q: "Does applying affect my credit?",
    a: "The initial application is for funding fit and readiness review. Any credit-impacting step depends on the lender and offer path."
  },
  {
    q: "Is Operion Capital a direct lender?",
    a: "Operion Capital is built to help prepare business funding requests and connect qualified applicants with suitable lender paths."
  }
];

export default function HomePage() {
  return (
    <PublicShell>
      <main>
        <section className="capital-cinematic relative isolate overflow-hidden px-4 pb-24 pt-[4.5rem] sm:px-6 sm:pt-20 lg:px-8 lg:pb-32 lg:pt-28">
          <div className="fintech-grid absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 h-px capital-divider" />
          <div className="absolute left-1/2 top-20 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="mx-auto max-w-6xl">
            <MotionDiv className="relative z-10 flex flex-col items-center text-center">
              <OperionLogo size="lg" layout="stacked" />
              <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-black/35 px-5 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary shadow-lg shadow-black/20 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Private capital infrastructure
              </div>
              <h1 className="mt-9 max-w-5xl font-serif text-5xl font-medium leading-[1.04] tracking-normal text-white sm:text-6xl lg:text-7xl">
                Private capital access for growth-focused businesses.
              </h1>
              <p className="mt-8 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
                Operion Capital prepares business funding requests with secure intake, private funding analysis, and lender matching infrastructure built for speed and discretion.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Button asChild size="lg">
                  <Link href="/apply">
                    Start application
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/funding-solutions">Explore solutions</Link>
                </Button>
              </div>
              <div className="mt-12 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
                {["Encrypted intake", "Private review", "Lender matching"].map((item) => (
                  <div key={item} className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-muted-foreground">
                    <BadgeCheck className="h-4 w-4 text-primary" />
                    {item}
                  </div>
                ))}
              </div>
            </MotionDiv>
          </div>
        </section>

        <MotionSection className="border-y border-white/10 bg-white/[0.025] px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                <p className="text-2xl font-semibold text-white">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </MotionSection>

        <MotionSection className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Trusted funding infrastructure"
              title="Built for revenue-generating businesses that need clear capital options."
              description="Operion Capital focuses on business owners who value speed, clean process, and transparent funding readiness."
            />
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {["Trucking", "Construction", "Restaurants", "Retail", "Healthcare", "Manufacturing", "Ecommerce", "Logistics"].map((industry) => (
                <div key={industry} className="rounded-md border border-white/10 bg-card/70 px-4 py-3 text-sm font-medium text-white">
                  {industry}
                </div>
              ))}
            </div>
          </div>
        </MotionSection>

        <MotionSection className="border-y border-white/10 bg-black/20 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <SectionHeading
              eyebrow="Funding analysis"
              title="Cleaner borrower profiles before lender review."
              description="The platform organizes application details, revenue signals, deposit data, industry context, and funding goals into a structured profile designed for faster review."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [ShieldCheck, "Secure intake", "Protected application flow and server-side processing."],
                [Banknote, "Funding fit", "MCA and business funding readiness signals."],
                [Landmark, "Lender criteria", "Routing architecture prepared for lender-specific requirements."],
                [LockKeyhole, "Compliance-ready", "Audit-friendly records, access control, and encrypted workflows."]
              ].map(([Icon, title, text]) => {
                const FeatureIcon = Icon as typeof ShieldCheck;
                return (
                  <div key={String(title)} className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                    <FeatureIcon className="h-5 w-5 text-primary" />
                    <h3 className="mt-4 font-semibold text-white">{title as string}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </MotionSection>

        <MotionSection className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="Funding process" title="A professional path from application to lender connection." />
            <div className="mt-10 grid gap-4 lg:grid-cols-4">
              {process.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="rounded-lg border border-white/10 bg-card/80 p-5">
                    <div className="flex items-center justify-between">
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="text-xs font-semibold text-muted-foreground">0{index + 1}</span>
                    </div>
                    <h3 className="mt-5 font-semibold text-white">{step.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </MotionSection>

        <MotionSection className="border-y border-white/10 bg-white/[0.025] px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
            <SectionHeading
              eyebrow="Lender network"
              title="Designed for intelligent lender matching as the network scales."
            description="Operion Capital's infrastructure prepares clean application records for lender routing, product fit, submission packages, and funding-stage visibility for internal operators."
            />
            <div className="grid gap-3">
              {["MCA providers", "Working-capital lenders", "Business loan partners", "Specialty financing paths"].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-lg border border-white/10 bg-card/80 p-4">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium text-white">{item}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          </div>
        </MotionSection>

        <MotionSection className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="Customer confidence" title="Trust signals built into the funding experience." />
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {[
                ["Bank-level security posture", "Secure application handling, protected routes, and restricted server-side data access."],
                ["Concierge workflow", "Applicants receive email-driven updates and direct specialist follow-up without portal complexity."],
                ["Verified stories coming soon", "Customer outcomes will be added only after launch verification and merchant authorization."]
              ].map(([title, text]) => (
                <div key={title} className="rounded-lg border border-white/10 bg-white/[0.035] p-6">
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </MotionSection>

        <MotionSection className="border-y border-white/10 bg-black/20 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <SectionHeading eyebrow="FAQ" title="Questions business owners ask first." />
            <div className="mt-8 divide-y divide-white/10 rounded-lg border border-white/10 bg-card/70">
              {faqs.map((faq) => (
                <div key={faq.q} className="p-5">
                  <h3 className="font-semibold text-white">{faq.q}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </MotionSection>

        <MotionSection className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-lg border border-primary/20 bg-primary/10 p-8 sm:p-10">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h2 className="text-3xl font-semibold tracking-normal text-white">Ready to see your funding options?</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Start with a secure application and get your business profile ready for private funding analysis and lender matching.
                </p>
              </div>
              <Button asChild size="lg">
                <Link href="/apply">
                  Apply now
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </MotionSection>
      </main>
    </PublicShell>
  );
}
