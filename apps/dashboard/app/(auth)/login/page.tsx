import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-[0.95fr_1.05fr]">
      <section className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Operion Capital
          </Link>
          <div className="rounded-lg border border-white/10 bg-card/85 p-6 shadow-2xl shadow-black/25">
            <div className="mb-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-primary/12 text-primary">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-semibold tracking-normal text-white">Sign in to your funding dashboard</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Access application status, document requests, funding updates, and account settings.
              </p>
            </div>
            <LoginForm />
          </div>
        </div>
      </section>

      <section className="hidden border-l border-white/10 bg-white/[0.025] p-8 lg:flex lg:items-center">
        <div className="mx-auto max-w-lg">
          <div className="rounded-lg border border-white/10 bg-card/80 p-6">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h2 className="mt-6 text-3xl font-semibold tracking-normal text-white">Secure access for business funding.</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              Operion Capital separates customer funding access from internal operator systems, keeping borrower workflows clean
              and protected.
            </p>
            <div className="mt-6 grid gap-3">
              {["Protected Supabase Auth sessions", "Encrypted application workflow", "Funding status and checklist visibility"].map((item) => (
                <div key={item} className="rounded-md border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-muted-foreground">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
