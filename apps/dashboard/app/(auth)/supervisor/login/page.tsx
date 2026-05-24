import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { OperionLogo } from "@/components/brand/operion-logo";

export const dynamic = "force-dynamic";

export default function SupervisorLoginPage() {
  return (
    <main className="capital-cinematic flex min-h-screen items-center justify-center px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Public site
        </Link>
        <div className="rounded-lg border border-primary/15 bg-black/45 p-7 shadow-2xl shadow-black/25 backdrop-blur">
          <div className="mb-7 flex items-center justify-between gap-4">
            <OperionLogo size="sm" />
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/12 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <h1 className="font-serif text-2xl font-medium tracking-normal text-white">Operator sign in</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Access the Operion Capital supervisor platform for funding operations, review queues, and lender routing.
          </p>
          <div className="mt-6">
            <LoginForm
              defaultRedirect="/supervisor"
              createAccountHref={null}
              forgotPasswordHref="/forgot-password"
              emailPlaceholder="founder@operion.ai"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
