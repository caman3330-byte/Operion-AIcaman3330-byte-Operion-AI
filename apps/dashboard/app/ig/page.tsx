import Link from "next/link";
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck, UploadCloud } from "lucide-react";
import { MerchantFunnelTracker } from "@/components/analytics/merchant-funnel-tracker";
import { TrackedApplyLink } from "@/components/analytics/tracked-apply-link";
import { OperionLogo } from "@/components/brand/operion-logo";
import { Button } from "@/components/ui/button";

const points = [
  "Funding from $10,000-$500,000",
  "Apply in minutes",
  "Secure document upload",
  "Human-reviewed funding options"
];

const faqs = [
  ["Do I need documents now?", "No. Apply first. Your secure upload link comes by email."],
  ["Is this automated?", "No. Funding options are reviewed by a human before next steps."],
  ["What businesses fit?", "Operating businesses with revenue, deposits, and a real funding need."]
];

export default function InstagramFundingPage() {
  return (
    <main className="min-h-screen bg-[#f8f5ec] text-[#17130c]">
      <MerchantFunnelTracker event="ig_visit" source="instagram" path="/ig" />
      <header className="border-b border-[#17130c]/10 bg-[#17130c] px-4 py-3 text-white">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <Link href="/" aria-label="Operion Capital home">
            <OperionLogo size="sm" showTagline={false} collapseWordmarkOnMobile />
          </Link>
          <TrackedApplyLink source="instagram" href="/apply?source=instagram-header" className="rounded-md bg-[#d7b76a] px-3 py-2 text-xs font-bold text-[#17130c]">
            Apply
          </TrackedApplyLink>
        </div>
      </header>

      <section className="px-4 pb-8 pt-6">
        <div className="mx-auto max-w-md">
          <div className="rounded-lg border border-[#d7b76a]/40 bg-white p-5 shadow-xl shadow-[#17130c]/10">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9b7624]">Business funding</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.02] tracking-normal text-[#17130c]">
              Need working capital for your business?
            </h1>
            <p className="mt-4 text-base leading-7 text-[#5c5140]">
              Start with a simple application. Upload statements later through a secure email link.
            </p>
            <div className="mt-5 grid gap-2">
              {points.map((point) => (
                <div key={point} className="flex items-center gap-2 rounded-md bg-[#fff7e4] px-3 py-2 text-sm font-semibold text-[#2a2113]">
                  <CheckCircle2 className="h-4 w-4 text-[#9b7624]" />
                  {point}
                </div>
              ))}
            </div>
            <Button asChild size="lg" className="mt-6 w-full bg-[#17130c] text-[#f8f5ec] hover:bg-[#2a2113]">
              <TrackedApplyLink source="instagram" href="/apply?source=instagram-hero">
                Check funding options
                <ArrowRight className="h-4 w-4" />
              </TrackedApplyLink>
            </Button>
            <p className="mt-3 text-center text-xs leading-5 text-[#6d6251]">
              No merchant dashboard. No document upload until after application submission.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            {[
              ["$10k-$500k", "Range"],
              ["Minutes", "Apply"],
              ["Secure", "Upload"]
            ].map(([value, label]) => (
              <div key={label} className="rounded-md border border-[#17130c]/10 bg-white px-2 py-3">
                <p className="text-sm font-bold text-[#17130c]">{value}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#7a6f5f]">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#17130c] px-4 py-8 text-white">
        <div className="mx-auto max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d7b76a]">How it works</p>
          <div className="mt-4 grid gap-3">
            {[
              [LockKeyhole, "Apply securely", "Submit basic business and funding details."],
              [UploadCloud, "Upload later", "Use the signed email link for bank statements."],
              [ShieldCheck, "Human review", "Your funding request is reviewed before next steps."]
            ].map(([Icon, title, text]) => {
              const ItemIcon = Icon as typeof LockKeyhole;
              return (
                <div key={String(title)} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex gap-3">
                    <ItemIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#d7b76a]" />
                    <div>
                      <h2 className="font-semibold text-white">{title as string}</h2>
                      <p className="mt-1 text-sm leading-6 text-white/70">{text as string}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-8">
        <div className="mx-auto max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9b7624]">FAQ</p>
          <div className="mt-4 divide-y divide-[#17130c]/10 rounded-lg border border-[#17130c]/10 bg-white">
            {faqs.map(([question, answer]) => (
              <div key={question} className="p-4">
                <h2 className="font-semibold text-[#17130c]">{question}</h2>
                <p className="mt-1 text-sm leading-6 text-[#5c5140]">{answer}</p>
              </div>
            ))}
          </div>
          <Button asChild size="lg" className="mt-5 w-full bg-[#17130c] text-[#f8f5ec] hover:bg-[#2a2113]">
            <TrackedApplyLink source="instagram" href="/apply?source=instagram-bottom">
              Apply in minutes
              <ArrowRight className="h-4 w-4" />
            </TrackedApplyLink>
          </Button>
        </div>
      </section>
    </main>
  );
}
