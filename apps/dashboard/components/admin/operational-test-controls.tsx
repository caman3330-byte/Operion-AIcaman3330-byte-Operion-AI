"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Mail, PlayCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type ResultState = {
  status: "idle" | "success" | "error";
  title: string;
  detail: string;
};

export function OperationalTestControls() {
  const [provider, setProvider] = useState("both");
  const [includeAi, setIncludeAi] = useState(false);
  const [executeWrites, setExecuteWrites] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailPurpose, setEmailPurpose] = useState("internal_ai_alert");
  const [message, setMessage] = useState<ResultState>({ status: "idle", title: "Ready", detail: "Choose an operational check to run." });
  const [isPending, startTransition] = useTransition();

  const testMerchant = useMemo(
    () => ({
      businessName: "Monday Readiness Logistics LLC",
      industry: "logistics",
      state: "NY",
      annualRevenue: 1250000,
      monthlyRevenue: 104000,
      monthlyDeposits: 87000,
      requestedAmount: 150000,
      productType: "mca",
      creditScoreRange: "650_699",
      ownerName: "Jordan Rivera",
      contactEmail: "readiness-test@operioncapital.com",
      contactPhone: "555-0188",
      ownershipPercentage: 100,
      bankName: "Readiness Bank",
      averageDailyBalance: 24000,
      fundingPurpose: "Working capital and equipment deposits",
      consentToContact: true,
      metadata: {
        source: "admin_operational_test_controls",
        test_mode: true
      }
    }),
    []
  );

  function runCheck(title: string, request: () => Promise<Response>) {
    setMessage({ status: "idle", title, detail: "Running..." });
    startTransition(async () => {
      try {
        const response = await request();
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessage({
            status: "error",
            title,
            detail: payload?.error?.message ?? payload?.error ?? `Request failed with ${response.status}`
          });
          return;
        }
        setMessage({
          status: "success",
          title,
          detail: summarizePayload(payload)
        });
      } catch (error) {
        setMessage({
          status: "error",
          title,
          detail: error instanceof Error ? error.message : "Request failed"
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
        <div className="space-y-1">
          <Label htmlFor="provider">AI Provider</Label>
          <Select id="provider" value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="both">Claude + OpenAI</option>
            <option value="claude">Claude</option>
            <option value="openai">OpenAI</option>
          </Select>
        </div>
        <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={includeAi}
            onChange={(event) => setIncludeAi(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Run live AI validation
        </label>
        <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={executeWrites}
            onChange={(event) => setExecuteWrites(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Include staging write smoke test
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_260px_auto]">
        <div className="space-y-1">
          <Label htmlFor="email-to">Test Email Recipient</Label>
          <Input
            id="email-to"
            type="email"
            value={emailTo}
            onChange={(event) => setEmailTo(event.target.value)}
            placeholder="founder@operion.ai"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email-purpose">Sender Purpose</Label>
          <Select id="email-purpose" value={emailPurpose} onChange={(event) => setEmailPurpose(event.target.value)}>
            <option value="merchant_outreach">Merchant outreach / funding@</option>
            <option value="document_upload_request">Document request / funding@</option>
            <option value="merchant_support">Merchant support / support@</option>
            <option value="merchant_contact">General contact / contact@</option>
            <option value="lender_outreach">Lender outreach / lenders@</option>
            <option value="lender_submission_package">Lender submission / submissions@</option>
            <option value="internal_ai_alert">Internal alert / alerts@</option>
            <option value="operational_summary">Ops summary / system@</option>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            disabled={isPending || !emailTo}
            onClick={() =>
              runCheck("SendGrid delivery test", () =>
                fetch("/api/test-email", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    to: emailTo,
                    subject: "Operion Capital operational email test",
                    text: "This confirms the Operion Capital branded SendGrid template, sender routing, and delivery path are wired for operational testing.",
                    purpose: emailPurpose
                  })
                })
              )
            }
          >
            <Mail className="h-4 w-4" />
            Test Email
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={isPending}
          onClick={() =>
            runCheck("Read-only Supabase smoke test", () =>
              fetch("/api/operations/smoke-test", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ executeWrites: false })
              })
            )
          }
        >
          <ShieldCheck className="h-4 w-4" />
          Smoke Test
        </Button>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            runCheck("Prelaunch validation", () =>
              fetch("/api/operations/prelaunch/validate", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  includeAiValidation: includeAi,
                  includeWriteSmokeTest: executeWrites,
                  provider,
                  ...(executeWrites ? { merchant: testMerchant } : {})
                })
              })
            )
          }
        >
          <PlayCircle className="h-4 w-4" />
          Prelaunch Validation
        </Button>
      </div>

      <div className={message.status === "error" ? "rounded-md border border-destructive bg-destructive/10 p-3" : "rounded-md border p-3"}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className={message.status === "error" ? "h-4 w-4 text-destructive" : "h-4 w-4 text-primary"} />
          <p className="text-sm font-medium">{message.title}</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{message.detail}</p>
      </div>
    </div>
  );
}

function summarizePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Request completed.";
  }
  const data = "data" in payload ? (payload as { data?: unknown }).data : payload;
  if (data && typeof data === "object" && "success" in data) {
    return `Completed with success=${String((data as { success?: unknown }).success)}.`;
  }
  if (data && typeof data === "object" && "status" in data) {
    return `Completed with status=${String((data as { status?: unknown }).status)}.`;
  }
  return "Request completed.";
}
