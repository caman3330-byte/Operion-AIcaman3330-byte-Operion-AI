"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UploadLinkRequestForm() {
  const [applicationId, setApplicationId] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage(null);

    try {
      const response = await fetch("/api/portal/upload-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          business_application_id: applicationId,
          email
        })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message ?? "Unable to request upload link.");
      }

      setStatus("sent");
      setMessage(result.data.message);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to request upload link.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-white/10 bg-card/80 p-5 shadow-xl shadow-black/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">Request secure upload link</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Enter the application ID and applicant email used on the funding application.
          </p>
        </div>
        <ShieldCheck className="h-5 w-5 text-primary" />
      </div>

      <div className="mt-5 grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="business_application_id">Application ID</Label>
          <Input
            id="business_application_id"
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
            placeholder="Business application ID"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Applicant email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="owner@business.com"
            required
          />
        </div>
      </div>

      <Button className="mt-5 w-full" type="submit" disabled={status === "submitting"}>
        <Mail className="h-4 w-4" />
        {status === "submitting" ? "Sending..." : "Send magic link"}
      </Button>

      {message ? (
        <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${status === "error" ? "border-rose-500 bg-rose-500/10 text-rose-200" : "border-emerald-500 bg-emerald-500/10 text-emerald-200"}`}>
          {message}
        </div>
      ) : null}
    </form>
  );
}
