import Link from "next/link";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-[0.95fr_1.05fr]">
      <section className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Operion Capital
          </Link>
          <div className="rounded-lg border border-white/10 bg-card/85 p-6 shadow-2xl shadow-black/25">
            <h1 className="text-2xl font-semibold tracking-normal text-white">Create your funding account</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Set up customer access for applications, status tracking, document requests, and funding updates.
            </p>
            <div className="mt-6">
              <SignupForm />
            </div>
          </div>
        </div>
      </section>
      <section className="hidden border-l border-white/10 bg-white/[0.025] p-8 lg:flex lg:items-center">
        <div className="mx-auto max-w-lg">
          <BadgeCheck className="h-7 w-7 text-primary" />
          <h2 className="mt-6 text-3xl font-semibold tracking-normal text-white">Built for business owners.</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Operion Capital gives applicants one secure place to manage funding progress, review requirements, and prepare
            lender-ready information.
          </p>
        </div>
      </section>
    </main>
  );
}
