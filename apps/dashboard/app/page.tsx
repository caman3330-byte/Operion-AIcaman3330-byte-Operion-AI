import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Landmark,
  Network,
  Sparkles,
  Workflow
} from "lucide-react";
import { PublicShell } from "@/components/marketing/public-shell";
import { Button } from "@/components/ui/button";

const journey = [
  {
    title: "Tell us about your business",
    text: "Submit business details, funding goals, contact information, and requested documents through a secure application.",
    icon: FileCheck2
  },
  {
    title: "Operion organizes the file",
    text: "The platform structures the application so operators can see what is complete, missing, or ready for review.",
    icon: ClipboardCheck
  },
  {
    title: "AI workers prepare the opportunity",
    text: "Internal workers help classify documents, organize signals, and keep the process moving inside approval boundaries.",
    icon: Workflow
  },
  {
    title: "Financing paths are identified",
    text: "Operion compares the application profile with suitable capital paths without implying guaranteed approval.",
    icon: Network
  },
  {
    title: "You review the next step",
    text: "The business receives a clear path forward, including document requests or lender-ready next actions when available.",
    icon: CheckCircle2
  }
];

const operations = [
  ["Application intake", "Encrypted business profile and document flow.", FileCheck2],
  ["Document intelligence", "Bank statements and records are organized for review.", ClipboardCheck],
  ["Qualification workspace", "Signals are checked before any next-step recommendation.", Sparkles],
  ["Lender pathing", "Potential financing paths are compared for fit.", Landmark]
];

export default function HomePage() {
  return (
    <PublicShell className="operion-light-shell">
      <main>
        <section className="relative isolate flex min-h-[460px] items-center px-4 py-16 sm:px-6 lg:px-8">
          <Image src="/merchant-journey-opening.webp" alt="Business owner in a bright office" fill priority sizes="100vw" className="-z-20 object-cover object-center" />
          <div className="absolute inset-0 -z-10 bg-black/50" />
          <div className="mx-auto w-full max-w-7xl text-white">
            <h1 className="max-w-2xl text-4xl font-semibold tracking-normal sm:text-5xl">Operion Capital</h1>
            <p className="mt-5 max-w-xl text-2xl font-medium">Funding for your next business step.</p>
            <p className="mt-4 max-w-xl text-base leading-7">Tell us what your business needs. Start a secure application and let our team help you explore suitable financing options.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-white text-slate-950 hover:bg-slate-100"><Link href="/apply">Start application <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="border-white bg-transparent text-white hover:bg-white hover:text-slate-950"><Link href="/contact">Talk to our team</Link></Button>
            </div>
          </div>
        </section>

        <section className="border-y border-sky-100 bg-white px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-700">The operating journey</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-normal text-[#071b33]">
                A clear path from merchant need to financing next step.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-5">
              {journey.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="rounded-lg border border-slate-200 bg-slate-50/60 p-5">
                    <div className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-bold text-slate-400">0{index + 1}</span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-slate-950">{step.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{step.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#f6fbff] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-700">Inside Operion</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-normal text-[#071b33]">
                Your application, organized in one place.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                Share your business details, upload supporting documents securely, and work with our team on the next step. Financing remains subject to review and lender approval.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {operations.map(([title, text, Icon]) => {
                const CardIcon = Icon as typeof FileCheck2;
                return (
                  <div key={String(title)} className="rounded-lg border border-sky-100 bg-white p-6">
                    <CardIcon className="h-6 w-6 text-sky-700" />
                    <h3 className="mt-5 text-lg font-semibold text-slate-950">{title as string}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{text as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 border-t border-slate-200 py-8 text-slate-950 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase text-sky-700">Operion Capital</p>
              <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-normal">
                Intelligent capital operations for growing businesses.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
                Start with a secure application. Operion will organize the file and help identify the appropriate next step.
              </p>
            </div>
            <Button asChild size="lg" className="bg-[#0b5cab] text-white hover:bg-[#084e91]">
              <Link href="/apply">
                Start application
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
