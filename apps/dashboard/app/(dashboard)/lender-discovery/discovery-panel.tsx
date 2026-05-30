"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Globe, Plus, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DiscoveryRow {
  id: string;
  company_name: string;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  states_served: string[] | null;
  funding_range_min: number | null;
  funding_range_max: number | null;
  intelligence_summary: string | null;
  confidence_score: number | null;
  discovery_source: string;
  status: string;
  founder_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface Props {
  initialRows: DiscoveryRow[];
}

function statusVariant(status: string) {
  if (status === "approved" || status === "outreach_ready") return "success";
  if (status === "rejected") return "destructive";
  if (status === "pending_review") return "warning";
  return "secondary";
}

function confidenceLabel(score: number | null) {
  if (score === null) return "—";
  if (score >= 0.8) return "High";
  if (score >= 0.5) return "Medium";
  return "Low";
}

function confidenceColor(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 0.8) return "text-green-400";
  if (score >= 0.5) return "text-yellow-400";
  return "text-red-400";
}

const emptyForm = {
  company_name: "",
  website_url: "",
  contact_email: "",
  contact_phone: "",
  states_served: "",
  funding_range_min: "",
  funding_range_max: "",
  intelligence_summary: "",
  confidence_score: ""
};

export function LenderDiscoveryPanel({ initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<DiscoveryRow[]>(initialRows);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const filtered = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);

  function handleFormChange(key: keyof typeof emptyForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmitLender() {
    if (!form.company_name.trim()) {
      setFormError("Company name is required.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/lender-discovery", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            company_name: form.company_name.trim(),
            website_url: form.website_url || null,
            contact_email: form.contact_email || null,
            contact_phone: form.contact_phone || null,
            states_served: form.states_served ? form.states_served.split(",").map((s) => s.trim()).filter(Boolean) : [],
            funding_range_min: form.funding_range_min ? Number(form.funding_range_min) : null,
            funding_range_max: form.funding_range_max ? Number(form.funding_range_max) : null,
            intelligence_summary: form.intelligence_summary || null,
            confidence_score: form.confidence_score ? Number(form.confidence_score) / 100 : null,
            discovery_source: "manual"
          })
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          setFormError(String(payload?.error ?? "Submission failed."));
          return;
        }
        const payload = await res.json();
        setRows((prev) => [payload.data, ...prev]);
        setForm(emptyForm);
        setShowAddForm(false);
        router.refresh();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Unexpected error.");
      }
    });
  }

  function handleReview(id: string, status: "approved" | "rejected" | "outreach_ready") {
    startTransition(async () => {
      const res = await fetch(`/api/lender-discovery/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, founder_notes: reviewNotes[id] ?? null })
      });
      if (res.ok) {
        const payload = await res.json();
        setRows((prev) => prev.map((r) => (r.id === id ? payload.data : r)));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["all", "pending_review", "approved", "outreach_ready", "rejected"] as const).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s.replaceAll("_", " ")}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAddForm ? "Cancel" : "Add lender"}
        </Button>
      </div>

      {showAddForm ? (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>Add Lender Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="ld-company">Company name *</Label>
                <Input id="ld-company" value={form.company_name} onChange={(e) => handleFormChange("company_name", e.target.value)} placeholder="MCA Lender Inc." />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ld-website">Website</Label>
                <Input id="ld-website" value={form.website_url} onChange={(e) => handleFormChange("website_url", e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ld-email">Contact email</Label>
                <Input id="ld-email" type="email" value={form.contact_email} onChange={(e) => handleFormChange("contact_email", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ld-phone">Contact phone</Label>
                <Input id="ld-phone" value={form.contact_phone} onChange={(e) => handleFormChange("contact_phone", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ld-states">States served (comma-separated)</Label>
                <Input id="ld-states" value={form.states_served} onChange={(e) => handleFormChange("states_served", e.target.value)} placeholder="NY, CA, TX" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="ld-min">Min funding ($)</Label>
                  <Input id="ld-min" type="number" value={form.funding_range_min} onChange={(e) => handleFormChange("funding_range_min", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ld-max">Max funding ($)</Label>
                  <Input id="ld-max" type="number" value={form.funding_range_max} onChange={(e) => handleFormChange("funding_range_max", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ld-confidence">Confidence score (0–100)</Label>
                <Input id="ld-confidence" type="number" min="0" max="100" value={form.confidence_score} onChange={(e) => handleFormChange("confidence_score", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ld-summary">Intelligence summary</Label>
              <textarea
                id="ld-summary"
                value={form.intelligence_summary}
                onChange={(e) => handleFormChange("intelligence_summary", e.target.value)}
                rows={3}
                placeholder="Lender specializes in..."
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div className="flex gap-3">
              <Button disabled={isPending} onClick={handleSubmitLender}>
                {isPending ? "Saving..." : "Add to discovery queue"}
              </Button>
              <Button variant="ghost" onClick={() => { setShowAddForm(false); setForm(emptyForm); setFormError(null); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No lenders found{statusFilter !== "all" ? ` with status "${statusFilter.replaceAll("_", " ")}"` : ""}. Add the first one above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <Card key={row.id} className="border-white/10">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{row.company_name}</p>
                      <Badge variant={statusVariant(row.status)}>{row.status.replaceAll("_", " ")}</Badge>
                      <span className={`text-xs font-medium ${confidenceColor(row.confidence_score)}`}>
                        {confidenceLabel(row.confidence_score)} confidence
                        {row.confidence_score !== null ? ` (${Math.round(row.confidence_score * 100)}%)` : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {row.website_url ? (
                        <a href={row.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                          <Globe className="h-3 w-3" />
                          {row.website_url.replace(/^https?:\/\//, "")}
                        </a>
                      ) : null}
                      {row.contact_email ? <span>{row.contact_email}</span> : null}
                      {row.contact_phone ? <span>{row.contact_phone}</span> : null}
                    </div>
                    {row.states_served?.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.states_served.slice(0, 8).map((s) => (
                          <span key={s} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">{s}</span>
                        ))}
                        {row.states_served.length > 8 ? <span className="text-[10px] text-muted-foreground">+{row.states_served.length - 8} more</span> : null}
                      </div>
                    ) : null}
                    {row.funding_range_min || row.funding_range_max ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Funding: ${(row.funding_range_min ?? 0).toLocaleString()} – ${(row.funding_range_max ?? 0).toLocaleString()}
                      </p>
                    ) : null}
                    {row.intelligence_summary ? (
                      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{row.intelligence_summary}</p>
                    ) : null}
                    {row.founder_notes ? (
                      <p className="mt-1 text-xs italic text-muted-foreground">Note: {row.founder_notes}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2 text-xs text-muted-foreground">
                    <span>Source: {row.discovery_source}</span>
                    <span>{new Date(row.created_at).toLocaleDateString()}</span>
                    {row.reviewed_by ? <span>Reviewed by {row.reviewed_by}</span> : null}
                  </div>
                </div>

                {row.status === "pending_review" ? (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Founder notes (optional)</Label>
                        <Input
                          value={reviewNotes[row.id] ?? ""}
                          onChange={(e) => setReviewNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          placeholder="Add a note before approving or rejecting..."
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" disabled={isPending} onClick={() => handleReview(row.id, "approved")}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleReview(row.id, "outreach_ready")}>
                          Outreach ready
                        </Button>
                        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => handleReview(row.id, "rejected")}>
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
