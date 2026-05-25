"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Eye, ListChecks, Mail, PlayCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type ResultState = {
  status: "idle" | "success" | "error";
  title: string;
  detail: string;
  httpStatus?: number;
  timestamp?: string;
  payload?: unknown;
  sender?: string | null;
  deliveryState?: string | null;
  templateKind?: string | null;
  renderDiagnostics?: Record<string, unknown> | null;
};

const CONTROLLED_TEST_INBOX = "atsgamers.99@gmail.com";

export function OperationalTestControls() {
  const [provider, setProvider] = useState("both");
  const [includeAi, setIncludeAi] = useState(false);
  const [executeWrites, setExecuteWrites] = useState(false);
  const [emailTo, setEmailTo] = useState(CONTROLLED_TEST_INBOX);
  const [emailPurpose, setEmailPurpose] = useState("internal_ai_alert");
  const [templateKind, setTemplateKind] = useState("application_received");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
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
        const data = payload?.data && typeof payload.data === "object" ? payload.data : null;
        const html = readString(data, "html");
        const subject = readString(data, "subject");
        if (html) {
          setPreviewHtml(html);
          setPreviewSubject(subject);
        }
        if (!response.ok) {
          setMessage({
            status: "error",
            title,
            detail: payload?.error?.message ?? payload?.error ?? `Request failed with ${response.status}`,
            httpStatus: response.status,
            timestamp: new Date().toISOString(),
            payload,
            sender: readSender(data),
            deliveryState: readString(data, "delivery_state"),
            templateKind: readString(data, "template_kind"),
            renderDiagnostics: readRecord(data, "render_diagnostics")
          });
          return;
        }
        setMessage({
          status: "success",
          title,
          detail: summarizePayload(payload),
          httpStatus: response.status,
          timestamp: new Date().toISOString(),
          payload,
          sender: readSender(data),
          deliveryState: readString(data, "delivery_state"),
          templateKind: readString(data, "template_kind"),
          renderDiagnostics: readRecord(data, "render_diagnostics")
        });
      } catch (error) {
        setMessage({
          status: "error",
          title,
          detail: error instanceof Error ? error.message : "Request failed",
          timestamp: new Date().toISOString()
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

      <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold tracking-normal">Controlled email simulation mode</p>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Full workflow delivery tests are forced to the approved inbox and tagged as simulation traffic. No live acquisition list is touched.
            </p>
          </div>
          <Badge variant="success">Inbox: {CONTROLLED_TEST_INBOX}</Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,1.2fr)_minmax(260px,0.9fr)_minmax(280px,1fr)]">
        <div className="space-y-2">
          <Label htmlFor="email-to">Test Email Recipient</Label>
          <Input
            id="email-to"
            type="email"
            value={emailTo}
            onChange={(event) => setEmailTo(event.target.value)}
            placeholder={CONTROLLED_TEST_INBOX}
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email-purpose">Sender Purpose</Label>
          <Select id="email-purpose" value={emailPurpose} onChange={(event) => setEmailPurpose(event.target.value)} className="h-12">
            <option value="merchant_outreach">Merchant outreach / funding@</option>
            <option value="document_upload_request">Document request / funding@</option>
            <option value="merchant_support">Merchant support / support@</option>
            <option value="merchant_contact">General contact / contact@</option>
            <option value="lender_outreach">Lender outreach / lenders@</option>
            <option value="lender_submission_package">Lender submission / submissions@</option>
            <option value="internal_ai_alert">Internal alert / alerts@</option>
            <option value="operational_summary">Ops summary / system@</option>
            <option value="internal_operations">Ops notification / operations@</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email-template">Template</Label>
          <Select id="email-template" value={templateKind} onChange={(event) => setTemplateKind(event.target.value)} className="h-12">
            <option value="application_received">Merchant: application received</option>
            <option value="document_upload_request">Merchant: secure upload request</option>
            <option value="underwriting_review">Merchant: funding review update</option>
            <option value="additional_document_request">Merchant: additional documents</option>
            <option value="approval_notification">Merchant: approval</option>
            <option value="decline_notification">Merchant: decline</option>
            <option value="merchant_follow_up_reminder">Merchant: follow-up reminder</option>
            <option value="merchant_outreach">Merchant: cold outreach</option>
            <option value="merchant_outreach_sequence">Merchant: outreach sequence</option>
            <option value="lender_partnership_outreach">Lender: partnership outreach</option>
            <option value="lender_submission_package">Lender: submission package</option>
            <option value="lender_package_summary">Lender: package summary</option>
            <option value="deal_routing_notification">Lender: routing notification</option>
            <option value="funding_request_package">Lender: funding request</option>
            <option value="iso_partnership_communication">Lender: ISO partnership</option>
            <option value="internal_ai_alert">Internal: alerts@</option>
            <option value="internal_support">Internal: support@</option>
            <option value="internal_system">Internal: system@</option>
            <option value="internal_submissions">Internal: submissions@</option>
            <option value="internal_operations_notification">Internal: operations@</option>
            <option value="operational_summary">Internal: operational summary</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() =>
              runCheck("Email template preview", () =>
                fetch("/api/test-email", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    to: emailTo || "preview@operioncapital.com",
                    text: "Preview only",
                    purpose: emailPurpose,
                    templateKind,
                    previewOnly: true
                  })
                })
              )
            }
          >
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          <Button
            variant="outline"
            disabled={isPending || !emailTo}
            onClick={() =>
              runCheck("SendGrid delivery test", () =>
                fetch("/api/test-email", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    to: emailTo,
                    subject: "Operion Capital operational email test",
                    text: "This confirms the Operion Capital branded SendGrid template, sender routing, and delivery path are wired for operational testing.",
                    purpose: emailPurpose,
                    templateKind
                  })
                })
              )
            }
          >
            <Mail className="h-4 w-4" />
            Test Email
          </Button>
          {previewHtml ? (
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => navigator.clipboard.writeText(previewHtml).catch(() => undefined)}
            >
              Copy HTML
            </Button>
          ) : null}
      </div>

      {previewHtml ? (
        <div className="space-y-3 rounded-md border border-white/[0.12] bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold tracking-normal">Email Preview Center</p>
              <p className="mt-1 text-xs text-muted-foreground">{previewSubject ?? "Rendered Operion Capital email template"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Desktop</Badge>
              <Badge variant="secondary">Mobile</Badge>
              <Badge variant="secondary">Raw HTML</Badge>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="overflow-hidden rounded-md border bg-[#f5f1e8]">
              <iframe title="Desktop email preview" srcDoc={previewHtml} className="h-[680px] w-full bg-[#f5f1e8]" />
            </div>
            <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-md border bg-[#f5f1e8]">
              <iframe title="Mobile email preview" srcDoc={previewHtml} className="h-[680px] w-full bg-[#f5f1e8]" />
            </div>
          </div>
          <details className="rounded-md border bg-black/20 p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Raw rendered HTML</summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{previewHtml}</pre>
          </details>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            runCheck("Full email simulation preview", () =>
              fetch("/api/operations/email-simulation/run", {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  to: emailTo || CONTROLLED_TEST_INBOX,
                  previewOnly: true,
                  forceControlledInbox: true
                })
              })
            )
          }
        >
          <Eye className="h-4 w-4" />
          Preview All Email Flows
        </Button>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            runCheck("Full controlled email simulation", () =>
              fetch("/api/operations/email-simulation/run", {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  to: emailTo || CONTROLLED_TEST_INBOX,
                  previewOnly: false,
                  forceControlledInbox: true
                })
              })
            )
          }
        >
          <ListChecks className="h-4 w-4" />
          Send All to Test Inbox
        </Button>
        <Button
          disabled={isPending}
          onClick={() =>
            runCheck("Read-only Supabase smoke test", () =>
              fetch("/api/operations/smoke-test", {
                method: "POST",
                credentials: "same-origin",
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
                credentials: "same-origin",
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

      <div className={message.status === "error" ? "rounded-md border border-destructive bg-destructive/10 p-4" : "rounded-md border p-4"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className={message.status === "error" ? "h-4 w-4 text-destructive" : "h-4 w-4 text-primary"} />
            <p className="text-sm font-medium">{message.title}</p>
          </div>
          <Badge variant={message.status === "error" ? "destructive" : message.status === "success" ? "success" : "secondary"}>
            {message.httpStatus ? `HTTP ${message.httpStatus}` : message.status}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{message.detail}</p>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <div>
            <span className="font-medium text-foreground">Sender:</span> {message.sender ?? "n/a"}
          </div>
          <div>
            <span className="font-medium text-foreground">Delivery:</span> {message.deliveryState ?? "n/a"}
          </div>
          <div>
            <span className="font-medium text-foreground">Template:</span> {message.templateKind ?? "n/a"}
          </div>
          <div>
            <span className="font-medium text-foreground">Timestamp:</span> {message.timestamp ? new Date(message.timestamp).toLocaleString() : "n/a"}
          </div>
        </div>
        {message.renderDiagnostics ? (
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
            {Object.entries(message.renderDiagnostics).map(([key, value]) => (
              <div key={key} className="rounded border bg-black/10 px-2 py-1">
                <span className="font-medium text-foreground">{key.replaceAll("_", " ")}:</span> {String(value)}
              </div>
            ))}
          </div>
        ) : null}
        {message.payload ? (
          <details className="mt-3 rounded-md border bg-black/20 p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Response payload</summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {JSON.stringify(message.payload, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function readSender(data: unknown) {
  if (!data || typeof data !== "object" || !("sender" in data)) return null;
  const sender = (data as { sender?: unknown }).sender;
  if (!sender || typeof sender !== "object") return null;
  const email = "email" in sender && typeof sender.email === "string" ? sender.email : null;
  const name = "name" in sender && typeof sender.name === "string" ? sender.name : null;
  return [name, email].filter(Boolean).join(" / ") || null;
}

function readString(data: unknown, key: string) {
  if (!data || typeof data !== "object" || !(key in data)) return null;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function readRecord(data: unknown, key: string) {
  if (!data || typeof data !== "object" || !(key in data)) return null;
  const value = (data as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function summarizePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Request completed.";
  }
  const data = "data" in payload ? (payload as { data?: unknown }).data : payload;
  if (data && typeof data === "object" && "success" in data) {
    return `Completed with success=${String((data as { success?: unknown }).success)}.`;
  }
  if (data && typeof data === "object" && "ok" in data) {
    const record = data as { ok?: unknown; total?: unknown; accepted?: unknown; failed?: unknown; simulation_mode?: unknown };
    const totals = typeof record.total === "number" ? ` ${record.accepted ?? 0}/${record.total} accepted, ${record.failed ?? 0} failed.` : "";
    return `Completed with ok=${String(record.ok)}${totals}${record.simulation_mode ? ` Mode: ${String(record.simulation_mode)}.` : ""}`;
  }
  if (data && typeof data === "object" && "status" in data) {
    return `Completed with status=${String((data as { status?: unknown }).status)}.`;
  }
  return "Request completed.";
}
