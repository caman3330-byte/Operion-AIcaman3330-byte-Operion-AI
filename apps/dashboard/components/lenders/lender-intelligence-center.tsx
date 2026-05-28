"use client";

import { useMemo, useState } from "react";
import type { Lender } from "@operion/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type LenderPayload = Omit<Lender, "id" | "created_at">;

interface LenderIntelligenceCenterProps {
  lenders: Lender[];
  onCreate: (payload: Partial<LenderPayload> & { company_name: string }) => Promise<void>;
  onUpdate: (id: string, payload: Partial<LenderPayload>) => Promise<void>;
}

const stages = ["all", "Discovered", "Enriched", "Pending Review", "Approved", "Outreach Ready", "Contacted", "Responded", "Partnered", "Inactive"] as const;
const tiers = ["all", "A", "B", "C"] as const;

export function LenderIntelligenceCenter({ lenders, onCreate, onUpdate }: LenderIntelligenceCenterProps) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<(typeof stages)[number]>("all");
  const [tier, setTier] = useState<(typeof tiers)[number]>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    company_name: "",
    website_url: "",
    contact_email: "",
    contact_page_url: "",
    broker_program_url: "",
    funding_products: "",
    industries_served: "",
    states_served: "",
    funding_range_max: "",
    min_monthly_revenue: "",
    min_months_in_business: "",
    min_fico: ""
  });
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return lenders.filter((lender) => {
      const matchesQuery = !needle || [lender.company_name, lender.website_url, lender.contact_email, lender.intelligence_summary]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
      const matchesStage = stage === "all" || lender.acquisition_stage === stage;
      const matchesTier = tier === "all" || lender.lender_tier === tier;
      return matchesQuery && matchesStage && matchesTier;
    });
  }, [lenders, query, stage, tier]);
  const stats = {
    discovered: lenders.length,
    pendingReview: lenders.filter((lender) => lender.approval_status === "pending_review").length,
    outreachReady: lenders.filter((lender) => lender.acquisition_stage === "Outreach Ready").length,
    aTier: lenders.filter((lender) => lender.lender_tier === "A").length
  };

  async function submitDiscovery() {
    if (!form.company_name.trim()) return;
    await onCreate({
      company_name: form.company_name.trim(),
      website_url: nullable(form.website_url),
      contact_email: nullable(form.contact_email),
      contact_page_url: nullable(form.contact_page_url),
      broker_program_url: nullable(form.broker_program_url),
      funding_products: splitList(form.funding_products),
      industries_served: splitList(form.industries_served),
      states_served: splitList(form.states_served),
      funding_range_max: numberOrNull(form.funding_range_max),
      max_funding: numberOrNull(form.funding_range_max),
      min_monthly_revenue: numberOrNull(form.min_monthly_revenue),
      min_months_in_business: numberOrNull(form.min_months_in_business),
      min_fico: numberOrNull(form.min_fico),
      active: false,
      whitelisted: false
    });
    setForm({
      company_name: "",
      website_url: "",
      contact_email: "",
      contact_page_url: "",
      broker_program_url: "",
      funding_products: "",
      industries_served: "",
      states_served: "",
      funding_range_max: "",
      min_monthly_revenue: "",
      min_months_in_business: "",
      min_fico: ""
    });
  }

  async function applyAction(id: string, payload: Partial<LenderPayload>) {
    setPendingId(id);
    try {
      await onUpdate(id, payload);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MiniStat label="discovered" value={stats.discovered} />
        <MiniStat label="pending review" value={stats.pendingReview} />
        <MiniStat label="outreach ready" value={stats.outreachReady} />
        <MiniStat label="A tier" value={stats.aTier} />
      </div>

      <div className="rounded-md border border-amber-500/30 bg-gradient-to-b from-amber-500/[0.06] to-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Lender Intelligence & Acquisition</h2>
            <p className="mt-1 text-sm text-muted-foreground">Public-source lender discovery, scoring, founder review, and draft-only outreach.</p>
          </div>
          <Badge variant="warning">approval gated</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input placeholder="Company name" value={form.company_name} onChange={(event) => setForm({ ...form, company_name: event.target.value })} />
          <Input placeholder="Website URL" value={form.website_url} onChange={(event) => setForm({ ...form, website_url: event.target.value })} />
          <Input placeholder="Contact email" value={form.contact_email} onChange={(event) => setForm({ ...form, contact_email: event.target.value })} />
          <Input placeholder="Broker/ISO page" value={form.broker_program_url} onChange={(event) => setForm({ ...form, broker_program_url: event.target.value })} />
          <Input placeholder="Contact page" value={form.contact_page_url} onChange={(event) => setForm({ ...form, contact_page_url: event.target.value })} />
          <Input placeholder="Products, comma separated" value={form.funding_products} onChange={(event) => setForm({ ...form, funding_products: event.target.value })} />
          <Input placeholder="Industries, comma separated" value={form.industries_served} onChange={(event) => setForm({ ...form, industries_served: event.target.value })} />
          <Input placeholder="States, comma separated" value={form.states_served} onChange={(event) => setForm({ ...form, states_served: event.target.value })} />
          <Input placeholder="Max funding" value={form.funding_range_max} onChange={(event) => setForm({ ...form, funding_range_max: event.target.value })} />
          <Input placeholder="Min monthly revenue" value={form.min_monthly_revenue} onChange={(event) => setForm({ ...form, min_monthly_revenue: event.target.value })} />
          <Input placeholder="Min months in business" value={form.min_months_in_business} onChange={(event) => setForm({ ...form, min_months_in_business: event.target.value })} />
          <Input placeholder="Min FICO" value={form.min_fico} onChange={(event) => setForm({ ...form, min_fico: event.target.value })} />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={submitDiscovery} disabled={!form.company_name.trim()}>Add discovered lender</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-md border bg-card p-3">
        <Input className="min-w-56 flex-1" placeholder="Search lender intelligence" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={stage} onChange={(event) => setStage(event.target.value as (typeof stages)[number])}>
          {stages.map((item) => <option key={item} value={item}>{item === "all" ? "All stages" : item}</option>)}
        </select>
        <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={tier} onChange={(event) => setTier(event.target.value as (typeof tiers)[number])}>
          {tiers.map((item) => <option key={item} value={item}>{item === "all" ? "All tiers" : `${item} Tier`}</option>)}
        </select>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {filtered.slice(0, 12).map((lender) => (
          <div key={lender.id} className="rounded-md border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">{lender.company_name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{lender.website_url ?? lender.contact_email ?? "No public contact captured"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={tierTone(lender.lender_tier)}>{lender.lender_tier ?? "C"} Tier</Badge>
                <Badge variant={lender.approval_status === "approved" ? "success" : lender.approval_status === "rejected" ? "destructive" : "warning"}>{lender.approval_status ?? "pending_review"}</Badge>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{lender.intelligence_summary ?? "No intelligence summary generated yet."}</p>
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>Stage: <span className="text-foreground">{lender.acquisition_stage ?? "Discovered"}</span></div>
              <div>Responsiveness: <span className="text-foreground">{lender.estimated_responsiveness ?? "unknown"}</span></div>
              <div>Products: <span className="text-foreground">{lender.funding_products?.join(", ") || lender.lender_type || "mca"}</span></div>
              <div>Max funding: <span className="text-foreground">{formatCurrency(lender.max_funding ?? lender.funding_range_max)}</span></div>
              <div>Min revenue: <span className="text-foreground">{formatCurrency(lender.min_monthly_revenue ?? lender.minimum_monthly_deposits)}</span></div>
              <div>Discovered: <span className="text-foreground">{formatDateTime(lender.first_discovered_at ?? lender.created_at)}</span></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pendingId === lender.id} onClick={() => applyAction(lender.id, { approval_status: "approved", acquisition_stage: "Approved" })}>Approve</Button>
              <Button size="sm" variant="outline" disabled={pendingId === lender.id} onClick={() => applyAction(lender.id, { approval_status: "rejected", acquisition_stage: "Inactive", active: false })}>Reject</Button>
              <Button size="sm" variant="outline" disabled={pendingId === lender.id || lender.approval_status !== "approved"} onClick={() => applyAction(lender.id, { acquisition_stage: "Outreach Ready", active: true })}>Mark outreach ready</Button>
              <Button size="sm" variant="outline" disabled={pendingId === lender.id} onClick={() => applyAction(lender.id, { approval_status: "archived", acquisition_stage: "Inactive", active: false, archived_at: new Date().toISOString() })}>Archive</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function numberOrNull(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== "" ? parsed : null;
}

function nullable(value: string) {
  return value.trim() ? value.trim() : null;
}

function tierTone(tier: Lender["lender_tier"]) {
  if (tier === "A") return "success";
  if (tier === "B") return "warning";
  return "secondary";
}
