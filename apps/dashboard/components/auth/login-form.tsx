"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export function LoginForm({
  defaultRedirect = "/supervisor",
  createAccountHref = null,
  forgotPasswordHref = null,
  emailPlaceholder = "owner@company.com"
}: {
  defaultRedirect?: string;
  createAccountHref?: string | null;
  forgotPasswordHref?: string | null;
  emailPlaceholder?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData(event.currentTarget);
      const submittedEmail = String(formData.get("email") ?? "").trim();
      const submittedPassword = String(formData.get("password") ?? "");
      if (!submittedEmail || !submittedPassword) {
        setMessage("Email and password are required.");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: submittedEmail,
        password: submittedPassword
      });

      if (error) {
        setMessage(error.message);
        return;
      }
      if (!data.session) {
        setMessage("Supabase did not return a session. Check email/password auth settings.");
        return;
      }

      const redirectTo = sanitizeRedirect(searchParams.get("redirectTo"), defaultRedirect);
      await router.replace(redirectTo as Route);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to initialize Supabase Auth.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={emailPlaceholder}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in" : "Sign in"}
      </Button>
      {forgotPasswordHref || createAccountHref ? (
        <div className="flex items-center justify-between text-sm">
          {forgotPasswordHref ? (
          <Link href={forgotPasswordHref as Route} className="text-primary hover:underline">
            Forgot password?
          </Link>
          ) : (
            <span />
          )}
          {createAccountHref ? (
            <Link href={createAccountHref as Route} className="text-muted-foreground hover:text-foreground">
              Create account
            </Link>
          ) : null}
        </div>
      ) : null}
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </form>
  );
}

function sanitizeRedirect(value: string | null, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}
