import Link from "next/link";
import { ArrowRight, Banknote, BriefcaseBusiness, CreditCard, Landmark } from "lucide-react";
import { MotionSection } from "@/components/marketing/motion-shell";
import { PublicShell } from "@/components/marketing/public-shell";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";

const solutions = [
  {
    title: "MCA funding",
    text: "Fast working-capital paths for businesses with consistent card or deposit activity.",
    icon: Banknote
  },
  {
    title: "Business loans",
    text: "Structured financing options for growth, expansion, equipment, payroll, and operating needs.",
    icon: Landmark
  },
  {
    title: "Line of credit readiness",
    text: "Profile preparation for revolving-capital review and lender-fit assessment.",
    icon: CreditCard
  },
  {
    title: "Lender matching",
    text: "Routing architecture built around industry, deposits, revenue, requested amount, and funding goals.",
    icon: BriefcaseBusiness
  }
];

export default function FundingSolutionsPage() {
  return (
    <PublicShell>
      <main>
        <section className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <SectionHeading
              eyebrow="Funding solutions"
              title="Business funding products prepared through one intelligent application."
              description="Apply once, structure your business profile, and prepare for review across MCA funding, business loans, and future lender-specific financing paths."
            />
            <div className="rounded-lg border border-primary/15 bg-black/30 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {["Revenue", "Deposits", "Industry", "Credit range", "Funding amount", "Use of funds"].map((item) => (
                  <div key={item} className="rounded-md border border-primary/15 bg-white/[0.025] p-4 text-sm font-medium text-white">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <MotionSection className="border-y border-white/10 bg-white/[0.025] px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-4">
            {solutions.map((solution) => {
              const Icon = solution.icon;
              return (
                <div key={solution.title} className="rounded-lg border border-primary/15 bg-black/30 p-5">
                  <Icon className="h-5 w-5 text-primary" />
                  <h2 className="mt-5 font-semibold text-white">{solution.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{solution.text}</p>
                </div>
              );
            })}
          </div>
        </MotionSection>

        <MotionSection className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-lg border border-primary/20 bg-primary/10 p-8 sm:p-10">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h2 className="font-serif text-3xl font-medium tracking-normal text-white">Start with one secure application.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Share your business details once and prepare your profile for private funding review.
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
