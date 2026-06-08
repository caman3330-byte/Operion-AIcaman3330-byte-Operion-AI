import { ArrowRight, BadgeDollarSign, FileCheck2, LockKeyhole, ShieldCheck, Sparkles, Timer, UploadCloud } from "lucide-react";
import { ApplicationForm } from "@/components/application/application-form";
import { MerchantLightShell } from "@/components/marketing/merchant-light-shell";
import { Button } from "@/components/ui/button";

type ApplySearchParams = {
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};

export default async function ApplyPage({
  searchParams
}: {
  searchParams?: Promise<ApplySearchParams>;
}) {
  const params = await searchParams;

  return (
    <MerchantLightShell>
      <main className="bg-[#fbfaf7] text-[#17130c]">
        <section className="border-b border-[#d7b76a]/25 px-4 py-8 sm:px-6 lg:px-8 lg:py-14">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d7b76a]/45 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#7a5a16] shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Private funding intake
            </div>
            <h1 className="mt-5 font-serif text-4xl font-semibold leading-[1.05] tracking-normal text-[#120f09] sm:text-5xl">
              Apply for $10,000-$500,000 in business funding.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[#5c5140]">
              Submit your business details in minutes. Documents come after through a secure upload link, and every funding option is human reviewed.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-[#17130c] text-[#f8f5ec] hover:bg-[#2a2113]">
                <a href="#application">
                  Start application
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <div className="flex items-center gap-2 rounded-md border border-[#17130c]/10 bg-white px-4 py-3 text-sm font-semibold text-[#2a2113]">
                <LockKeyhole className="h-4 w-4 text-[#9b7624]" />
                Secure intake
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                [BadgeDollarSign, "$10k-$500k", "Funding range"],
                [Timer, "Minutes", "Application time"],
                [UploadCloud, "Upload later", "Secure document link"]
              ].map(([Icon, title, text]) => {
                const ItemIcon = Icon as typeof ShieldCheck;
                return (
                  <div key={String(title)} className="rounded-lg border border-[#d7b76a]/30 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <ItemIcon className="mt-0.5 h-5 w-5 text-[#9b7624]" />
                      <div>
                        <p className="font-semibold text-[#17130c]">{title as string}</p>
                        <p className="mt-1 text-sm leading-6 text-[#635847]">{text as string}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div id="application" className="scroll-mt-24">
            <ApplicationForm
              initialAttribution={{
                source: params?.source ?? null,
                utm_source: params?.utm_source ?? null,
                utm_medium: params?.utm_medium ?? null,
                utm_campaign: params?.utm_campaign ?? null
              }}
            />
          </div>
          </div>
        </section>
        <section className="px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {[
              [ShieldCheck, "Human reviewed", "No automatic approvals or anonymous merchant dashboard."],
              [FileCheck2, "Application first", "Submit details now and upload bank statements only after email confirmation."],
              [LockKeyhole, "Secure document flow", "Signed upload access keeps sensitive files out of ordinary email threads."]
            ].map(([Icon, title, text]) => {
              const ItemIcon = Icon as typeof ShieldCheck;
              return (
                <div key={String(title)} className="rounded-lg border border-[#17130c]/10 bg-white p-5 shadow-sm">
                  <ItemIcon className="h-5 w-5 text-[#9b7624]" />
                  <h2 className="mt-4 text-lg font-semibold text-[#17130c]">{title as string}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#635847]">{text as string}</p>
                </div>
              );
            })}
          </div>
        </section>
        <section className="border-y border-[#d7b76a]/25 bg-white px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9b7624]">Simple process</p>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              {[
                ["Apply", "Share business, owner, revenue, and funding details."],
                ["Confirm", "Receive confirmation and secure upload instructions."],
                ["Upload", "Send statements through the signed document portal."],
                ["Review", "Operion prepares your file for human funding review."]
              ].map(([title, text], index) => (
                <div key={title} className="rounded-lg border border-[#17130c]/10 bg-[#fffaf0] p-5">
                  <span className="text-xs font-bold text-[#9b7624]">0{index + 1}</span>
                  <h2 className="mt-3 text-lg font-semibold text-[#17130c]">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#635847]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </MerchantLightShell>
  );
}
