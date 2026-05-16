import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        <Link href="/signin" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>
        <div className="rounded-lg border border-white/10 bg-card/85 p-6 shadow-2xl shadow-black/25">
          <h1 className="text-2xl font-semibold tracking-normal text-white">Reset your password</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Enter your email and we will send reset instructions.</p>
          <div className="mt-6">
            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </main>
  );
}
