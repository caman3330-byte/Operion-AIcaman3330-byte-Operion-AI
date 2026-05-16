"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") ?? "").trim();
      if (!email) {
        setMessage("Email is required.");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/reset-password`
      });

      setMessage(error ? error.message : "Password reset instructions sent if the account exists.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start password reset.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Sending" : "Send reset link"}
      </Button>
      <Link href="/signin" className="block text-sm text-primary hover:underline">
        Back to login
      </Link>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  );
}
