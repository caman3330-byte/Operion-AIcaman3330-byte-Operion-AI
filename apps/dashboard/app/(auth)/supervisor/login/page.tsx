import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default function SupervisorLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Public site
        </Link>
        <div className="rounded-lg border border-white/10 bg-card/85 p-6 shadow-2xl shadow-black/25">
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-md bg-primary/12 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-white">Internal operator sign in</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Access the internal Operion AI supervisor platform for funding operations, underwriting review, and lender routing.
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
