import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileCheck2,
  HelpCircle,
  LockKeyhole,
  ShieldCheck,
  UploadCloud
} from "lucide-react";
import { MerchantFunnelTracker } from "@/components/analytics/merchant-funnel-tracker";
import { TrackedApplyLink } from "@/components/analytics/tracked-apply-link";
import { MerchantLightShell } from "@/components/marketing/merchant-light-shell";
import { Button } from "@/components/ui/button";

const benefits = [
  ["Apply in minutes", "Submit core business details first. Documents come after through a secure upload link."],
  ["Human-reviewed options", "Your funding request is reviewed for fit before lender package preparation."],
  ["Secure document upload", "Bank statements and supporting files are handled through signed upload access."],
  ["Built for operating businesses", "Designed for merchants with revenue, deposits, and near-term working-capital needs."]
];

const uses = [
  "Payroll",
  "Inventory",
  "Equipment",
  "Repairs",
  "Expansion",
  "Marketing",
  "Seasonal cash flow",
  "Emergency operating needs"
];

const steps = [
  ["Apply", "Share business, revenue, owner, and funding details."],
  ["Upload", "Receive a secure email link for statements and documents."],
  ["Review", "Operion prepares your file for private funding review."],
  ["Options", "Discuss the next funding path with human oversight."]
];

const faqs = [
  ["How much funding can I request?", "Operion supports funding requests from $10,000 to $500,000 for qualified businesses."],
  ["Do I upload documents in the application?", "No. Submit the application first, then use the secure upload link sent by email."],
  ["Is this automated approval?", "No. Funding options are human-reviewed and approval-gated."],
  ["What documents are usually needed?", "Recent bank statements are the usual starting point. Additional documents depend on the funding path."],
  ["Does applying affect my credit?", "The initial application is for funding review. Any credit-impacting step depends on the lender process."]
];

export default function BusinessFundingPage() {
  return (
    <MerchantLightShell className="bg-[#fbfaf7] text-[#17130c]">
      <MerchantFunnelTracker event="business_funding_visit" source="business-funding" path="/business-funding" />
      <main className="bg-[#fbfaf7] text-[#17130c]">
        <section className="relative overflow-hidden border-b border-[#d7b76a]/25 bg-[#fbfaf7] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="absolute inset-x-0 top-0 h-2 bg-[#d7b76a]" />
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#d7b76a]/45 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5a16] shadow-sm">
                <BadgeDollarSign className="h-3.5 w-3.5" />
                Business funding for active merchants
              </div>
              <h1 className="mt-6 max-w-4xl font-serif text-4xl font-semibold leading-[1.05] tracking-normal text-[#120f09] sm:text-5xl lg:text-6xl">
                Funding from $10,000-$500,000 for growth-focused businesses.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#5c5140] sm:text-lg">
                Apply in minutes, upload documents securely after submission, and get human-reviewed funding options prepared for private review.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="bg-[#17130c] text-[#f8f5ec] hover:bg-[#2a2113]">
                  <TrackedApplyLink source="business-funding" href="/apply?source=business-funding">
                    Apply in minutes
                    <ArrowRight className="h-4 w-4" />
                  </TrackedApplyLink>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-[#17130c]/20 bg-white text-[#17130c] hover:bg-[#fff8df] hover:text-[#17130c]">
                  <Link href="#process">See the process</Link>
                </Button>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  [Clock3, "Apply in Minutes"],
                  [UploadCloud, "Secure Document Upload"],
                  [ShieldCheck, "Human Reviewed Funding Options"]
                ].map(([Icon, label]) => {
                  const ItemIcon = Icon as typeof Clock3;
                  return (
                    <div key={String(label)} className="flex items-center gap-2 rounded-md border border-[#d7b76a]/30 bg-white px-3 py-3 text-sm font-semibold text-[#2a2113] shadow-sm">
                      <ItemIcon className="h-4 w-4 text-[#9b7624]" />
                      {label as string}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-[#d7b76a]/40 bg-white p-5 text-[#17130c] shadow-2xl shadow-[#17130c]/10">
              <div className="rounded-md border border-[#d7b76a]/30 bg-[#fffaf0] p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9b7624]">Funding snapshot</p>
                <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[#17130c]">$10k-$500k</h2>
                <p className="mt-2 text-sm leading-6 text-[#5c5140]">A clean application-first path for merchants who need fast working capital review.</p>
                <div className="mt-5 grid gap-3">
                  {[
                    ["Funding range", "$10,000-$500,000"],
                    ["Application time", "Minutes"],
                    ["Document flow", "Secure upload link"],
                    ["Review model", "Human-reviewed"]
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 rounded-md border border-[#17130c]/10 bg-white px-4 py-3">
                      <span className="text-sm text-[#635847]">{label}</span>
                      <span className="text-sm font-semibold text-[#17130c]">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionIntro eyebrow="Benefits" title="A faster, cleaner funding intake for business owners." />
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {benefits.map(([title, text]) => (
                <div key={title} className="rounded-lg border border-[#17130c]/10 bg-white p-5 shadow-sm">
                  <CheckCircle2 className="h-5 w-5 text-[#9b7624]" />
                  <h2 className="mt-4 text-lg font-semibold text-[#17130c]">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#635847]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[#17130c]/10 bg-white px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <SectionIntro eyebrow="Funding uses" title="Use capital where the business needs it most." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {uses.map((item) => (
                <div key={item} className="rounded-md border border-[#d7b76a]/35 bg-[#fffaf0] px-4 py-3 text-sm font-semibold text-[#2a2113]">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="process" className="px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionIntro eyebrow="Simple process" title="Application first. Documents second. Human review throughout." />
            <div className="mt-8 grid gap-4 lg:grid-cols-4">
              {steps.map(([title, text], index) => (
                <div key={title} className="rounded-lg border border-[#17130c]/10 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <FileCheck2 className="h-5 w-5 text-[#9b7624]" />
                    <span className="text-xs font-bold text-[#9b7624]">0{index + 1}</span>
                  </div>
                  <h2 className="mt-5 text-lg font-semibold text-[#17130c]">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#635847]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[#d7b76a]/25 bg-white px-4 py-14 text-[#17130c] sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9b7624]">Ready when you are</p>
              <h2 className="mt-3 max-w-3xl font-serif text-3xl font-semibold tracking-normal sm:text-4xl">
                Start with a secure application and get your funding file moving.
              </h2>
            </div>
            <Button asChild size="lg" className="bg-[#17130c] text-[#f8f5ec] hover:bg-[#2a2113]">
              <TrackedApplyLink source="business-funding" href="/apply?source=business-funding-midpage">
                Apply now
                <ArrowRight className="h-4 w-4" />
              </TrackedApplyLink>
            </Button>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <SectionIntro eyebrow="FAQ" title="Questions business owners ask before applying." />
            <div className="mt-8 divide-y divide-[#17130c]/10 rounded-lg border border-[#17130c]/10 bg-white">
              {faqs.map(([question, answer]) => (
                <div key={question} className="p-5">
                  <div className="flex gap-3">
                    <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#9b7624]" />
                    <div>
                      <h2 className="font-semibold text-[#17130c]">{question}</h2>
                      <p className="mt-2 text-sm leading-6 text-[#635847]">{answer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-lg border border-[#d7b76a]/40 bg-[#fffaf0] p-6 sm:p-8">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h2 className="font-serif text-3xl font-semibold tracking-normal text-[#17130c]">Check your funding options.</h2>
                <p className="mt-2 text-sm leading-6 text-[#635847]">Submit core details now. Upload statements only after the secure email link arrives.</p>
              </div>
              <Button asChild size="lg" className="bg-[#17130c] text-[#f8f5ec] hover:bg-[#2a2113]">
                <TrackedApplyLink source="business-funding" href="/apply?source=business-funding-bottom">
                  Start application
                  <ArrowRight className="h-4 w-4" />
                </TrackedApplyLink>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </MerchantLightShell>
  );
}

function SectionIntro({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9b7624]">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight tracking-normal text-[#17130c] sm:text-4xl">{title}</h2>
    </div>
  );
}
