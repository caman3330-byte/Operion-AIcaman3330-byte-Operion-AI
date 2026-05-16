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
  Sparkles,
  Timer
} from "lucide-react";
import { MotionDiv, MotionSection } from "@/components/marketing/motion-shell";
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
    text: "Submit core business, revenue, deposit, ownership, and funding needs through an encrypted application flow.",
    icon: FileCheck2
  },
  {
    title: "AI-assisted underwriting readiness",
    text: "Operion structures your funding profile so required information is clear, complete, and ready for review.",
    icon: Sparkles
  },
  {
    title: "Match with lender paths",
    text: "Applications are prepared for lender routing based on funding product, requested amount, industry, and business profile.",
    icon: Network
  },
  {
    title: "Track next steps",
    text: "Business owners get a clean portal for progress, requirements, documents, and funding status.",
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
        <section className="relative isolate overflow-hidden px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pb-24 lg:pt-20">
          <div className="fintech-grid absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <MotionDiv className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                AI-powered business funding
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-normal text-white sm:text-6xl lg:text-7xl">
                Intelligent capital access for modern businesses.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                Operion Capital helps business owners apply for MCA funding and business loans, prepare lender-ready profiles,
                and move through the funding process with speed, clarity, and trust.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
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
              <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
                {["Encrypted application", "AI-assisted review", "Lender matching"].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BadgeCheck className="h-4 w-4 text-primary" />
                    {item}
                  </div>
                ))}
              </div>
            </MotionDiv>

            <MotionDiv delay={0.12} className="relative z-10">
              <div className="glass-panel rounded-lg p-3">
                <div className="rounded-md border border-white/10 bg-slate-950/80 p-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Funding intelligence workspace</p>
                      <p className="mt-1 text-xs text-muted-foreground">Application readiness and lender matching</p>
                    </div>
                    <span className="rounded-md bg-primary/12 px-2.5 py-1 text-xs font-semibold text-primary">Live profile</span>
                  </div>
                  <div className="grid gap-3 py-4 sm:grid-cols-3">
                    {[
                      ["Requested", "$125k"],
                      ["Deposits", "$62k/mo"],
                      ["Readiness", "86%"]
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md border border-white/10 bg-white/[0.035] p-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-1 text-xl font-semibold text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">Review sequence</p>
                        <Timer className="h-4 w-4 text-primary" />
                      </div>
                      {["Business data verified", "Revenue profile structured", "Lender routing prepared"].map((item) => (
                        <div key={item} className="mb-3 flex items-center gap-3 last:mb-0">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-sm text-muted-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
                      <p className="text-sm font-semibold text-white">Potential paths</p>
                      <div className="mt-4 space-y-3">
                        {["MCA funding", "Business loan", "Line of credit"].map((path) => (
                          <div key={path} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted-foreground">{path}</span>
                            <span className="h-2 w-16 rounded-full bg-primary/50" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
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
              eyebrow="AI-assisted underwriting"
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
              description="Operion Capital's infrastructure prepares clean application records for lender routing, product fit, offer tracking, and funding-status visibility."
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
                ["Transparent workflow", "Customers can see where their application stands and what information is needed next."],
                ["Verified stories coming soon", "Customer outcomes will be added only after launch verification and customer approval."]
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
                  Start with a secure application and get your business profile ready for AI-assisted review and lender matching.
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
