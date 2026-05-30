"use client";

import { useState, useTransition } from "react";
import { Eye, FileText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const TEMPLATES = [
  { value: "lender_partnership_outreach", label: "Partnership intro — new lender relationship" },
  { value: "lender_outreach", label: "Matched opportunity — specific deal" },
  { value: "lender_submission_package", label: "Submission package — full deal file" },
  { value: "funding_request_package", label: "Funding request package — structured ask" }
] as const;

type TemplateKind = (typeof TEMPLATES)[number]["value"];

export function LenderOutreachDraftBuilder() {
  const [templateKind, setTemplateKind] = useState<TemplateKind>("lender_partnership_outreach");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePreview() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/test-email", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            to: recipientEmail || "preview@operioncapital.com",
            text: "Preview only",
            purpose: "lender_outreach",
            templateKind,
            previewOnly: true
          })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(String(payload?.error ?? "Preview failed."));
          return;
        }
        const data = payload?.data ?? {};
        setPreviewHtml(data.html ?? null);
        setPreviewSubject(data.subject ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error.");
      }
    });
  }

  return (
    <Card className="border-primary/20 bg-[radial-gradient(circle_at_top_left,rgba(215,183,106,0.07),transparent_40%),rgba(255,255,255,0.02)]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Lender Outreach Draft Builder</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Compose and preview lender-specific outreach emails. All drafts require founder approval before sending.
            </p>
          </div>
          <Badge variant="warning">
            <ShieldCheck className="mr-1 h-3 w-3" />
            Approval-gated — no autonomous sending
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="od-template">Email template</Label>
            <Select
              id="od-template"
              value={templateKind}
              onChange={(e) => setTemplateKind(e.target.value as TemplateKind)}
              className="h-10"
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="od-company">Lender company</Label>
            <Input
              id="od-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Capital Funding Group"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="od-contact">Contact name</Label>
            <Input
              id="od-contact"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="John Smith"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="od-email">Contact email</Label>
            <Input
              id="od-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="john@lender.com"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={isPending} onClick={handlePreview}>
            <Eye className="h-4 w-4" />
            {isPending ? "Generating..." : "Preview template"}
          </Button>
          {previewHtml ? (
            <Button
              variant="ghost"
              onClick={() => navigator.clipboard.writeText(previewHtml).catch(() => undefined)}
            >
              <FileText className="h-4 w-4" />
              Copy HTML
            </Button>
          ) : null}
        </div>

        <div className="rounded-md border border-white/10 bg-black/20 p-3 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">Outreach is approval-gated.</span> Previewing a template does not send anything.
          To send, campaigns must be created through the Campaigns queue and approved by the founder before any worker dispatches them.
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {previewHtml ? (
          <div className="space-y-3 rounded-md border border-white/12 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Email Preview</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{previewSubject ?? "Rendered template"}</p>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">Desktop</Badge>
                <Badge variant="secondary">Mobile</Badge>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
              <div className="overflow-hidden rounded-md border bg-[#f5f1e8]">
                <iframe title="Desktop preview" srcDoc={previewHtml} className="h-[600px] w-full bg-[#f5f1e8]" />
              </div>
              <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-md border bg-[#f5f1e8]">
                <iframe title="Mobile preview" srcDoc={previewHtml} className="h-[600px] w-full bg-[#f5f1e8]" />
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
