"use client";

import { useState, useTransition } from "react";
import { Bot, CheckCircle2, Globe, Mail, Phone, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AcquisitionLead {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  state: string | null;
  qualification_score: number | null;
  tier: string | null;
  status: string;
  ai_summary: string | null;
  internal_notes: string | null;
  created_at: string;
}

interface Props {
  initialLeads: AcquisitionLead[];
}

function tierColor(tier: string | null) {
  if (tier === "A") return "text-green-400";
  if (tier === "B") return "text-yellow-400";
  if (tier === "C") return "text-orange-400";
  return "text-red-400";
}

function safeParseNotes(notes: string | null): Record<string, unknown> {
  if (!notes) return {};
  try {
    return JSON.parse(notes) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function AcquisitionQueuePanel({ initialLeads }: Props) {
  const router = useRouter();
  const [leads, setLeads] = useState<AcquisitionLead[]>(initialLeads);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function handleRunAgent() {
    setAgentStatus("Running lead acquisition agent — discovering MCA prospects...");
    startTransition(async () => {
      try {
        const res = await fetch("/api/workers/lead-acquisition-agent", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ limit: 30 })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setAgentStatus(`Agent failed: ${String((err as Record<string, unknown>)?.error ?? "Unknown error")}`);
          return;
        }
        const payload = await res.json() as { data: { inserted: number; duplicates: number; failed: number; total_fetched: number; sources_used: string[] } };
        const d = payload.data;
        setAgentStatus(
          `Agent complete — ${d.inserted} new leads discovered, ${d.duplicates} duplicates skipped, ${d.failed} failed. Sources: ${d.sources_used.join(", ") || "none"}.`
        );
        router.refresh();
      } catch (err) {
        setAgentStatus(`Agent error: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    });
  }

  function handleReview(id: string, action: "approve" | "reject") {
    startTransition(async () => {
      const res = await fetch(`/api/acquisition/leads/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, notes: reviewNotes[id] ?? null })
      });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => l.id !== id));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Agent trigger */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            Lead Acquisition Queue
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {leads.length} pending founder review
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Leads discovered via Google Places, OpenCorporates, and AI seed. No contact made until approved.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={isPending} onClick={handleRunAgent}>
          <Bot className="h-4 w-4" />
          {isPending ? "Discovering..." : "Run acquisition agent"}
        </Button>
      </div>

      {agentStatus ? (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-primary">Acquisition agent:</span> {agentStatus}
        </div>
      ) : null}

      {leads.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-card/80 px-5 py-10 text-center text-sm text-muted-foreground">
          No leads pending review. Run the acquisition agent to discover MCA prospects.
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const meta = safeParseNotes(lead.internal_notes);
            const discoverySource = typeof meta.discovery_source === "string" ? meta.discovery_source : "unknown";
            const websiteUrl = typeof meta.website_url === "string" ? meta.website_url : null;

            return (
              <Card key={lead.id} className="border-white/10">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Header */}
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-white">{lead.business_name}</p>
                        <Badge variant="warning">pending review</Badge>
                        {lead.tier ? (
                          <span className={`text-xs font-bold ${tierColor(lead.tier)}`}>
                            Tier {lead.tier} ({lead.qualification_score ?? 0}/100)
                          </span>
                        ) : null}
                      </div>

                      {/* Meta row */}
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {lead.industry ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{lead.industry}</span> : null}
                        {lead.state ? <span>{lead.state}</span> : null}
                        {lead.contact_name ? <span>{lead.contact_name}</span> : null}
                      </div>

                      {/* Contact info */}
                      <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {lead.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {lead.phone}
                          </span>
                        ) : null}
                        {lead.email ? (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {lead.email}
                          </span>
                        ) : null}
                        {websiteUrl ? (
                          <a
                            href={websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-primary"
                          >
                            <Globe className="h-3 w-3" />
                            {websiteUrl.replace(/^https?:\/\//, "").split("/")[0]}
                          </a>
                        ) : null}
                      </div>

                      {/* AI summary */}
                      {lead.ai_summary ? (
                        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{lead.ai_summary}</p>
                      ) : null}
                    </div>

                    {/* Right meta */}
                    <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                      <span>Source: {discoverySource.replaceAll("_", " ")}</span>
                      <span>{new Date(lead.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Review actions */}
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Notes (optional)</Label>
                        <Input
                          value={reviewNotes[lead.id] ?? ""}
                          onChange={(e) => setReviewNotes((prev) => ({ ...prev, [lead.id]: e.target.value }))}
                          placeholder="Add a note before approving or rejecting..."
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleReview(lead.id, "approve")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={() => handleReview(lead.id, "reject")}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
