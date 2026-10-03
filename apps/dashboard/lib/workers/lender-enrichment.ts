import type { Json } from "@operion/shared";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { selectAnthropicModel } from "@/lib/ai/anthropic-models";
import { logger } from "@/lib/logger";
import { readServerEnv } from "@/lib/env";

export interface LenderEnrichmentResult {
  processed: number;
  enriched: number;
  failed: number;
  items: Array<{
    id: string;
    company_name: string;
    status: "enriched" | "failed";
    confidence_score?: number;
    reason?: string;
  }>;
}

interface LenderRecord {
  id: string;
  company_name: string;
  website_url: string | null;
  contact_email: string | null;
  funding_range_min: number | null;
  funding_range_max: number | null;
  status: string;
}

interface ClaudeEnrichment {
  intelligence_summary: string;
  confidence_score: number;
  products: string[];
  min_fico: number | null;
  min_monthly_revenue: number | null;
  min_time_in_business_months: number | null;
  states_served: string[];
  key_differentiators: string[];
  contact_roles: string[];
}

async function callClaudeForLenderEnrichment(record: LenderRecord, apiKey: string, model: string): Promise<ClaudeEnrichment | null> {
  const rangeStr = record.funding_range_min && record.funding_range_max
    ? `$${(record.funding_range_min / 1000).toFixed(0)}K – $${(record.funding_range_max >= 1_000_000 ? (record.funding_range_max / 1_000_000).toFixed(1) + "M" : (record.funding_range_max / 1000).toFixed(0) + "K")}`
    : "unknown";

  const prompt = `You are a senior analyst with deep expertise in the US MCA and business lending industry.

Analyze this business funding company and provide structured intelligence for our lender network:

Company: ${record.company_name}
Website: ${record.website_url ?? "not provided"}
Known funding range: ${rangeStr}

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "intelligence_summary": "2-3 sentence professional summary: market position, typical merchant profile, funding speed, underwriting approach, and ISO/broker relationship style",
  "confidence_score": <integer 60-95: higher for established national lenders, lower for regional/smaller players>,
  "products": ["array from: MCA, business_loan, line_of_credit, equipment_financing, invoice_factoring, SBA_loan, revenue_based_financing, working_capital, business_banking"],
  "min_fico": <integer minimum FICO, typically 500-650 for MCA lenders, null for flexible/sub-prime funders>,
  "min_monthly_revenue": <integer minimum monthly deposits/revenue in USD, e.g. 10000>,
  "min_time_in_business_months": <integer minimum months in business, e.g. 6>,
  "states_served": ["2-letter codes — all 50 if national; list specific states if known geographic restrictions exist"],
  "key_differentiators": ["2-4 specific differentiators: funding speed, ISO commission rates, industry specializations, approval criteria, or technology"],
  "contact_roles": ["typical contact roles for ISO partnerships, e.g. iso_relations, partnerships, underwriting"]
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        temperature: 0,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logger.error("lender_enrichment_claude_error", { status: response.status, company: record.company_name, error: errText.slice(0, 200) });
      return null;
    }

    const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const rawText = data.content?.find((c) => c.type === "text")?.text ?? "";
    const cleanText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    if (!cleanText) return null;

    const parsed = JSON.parse(cleanText) as ClaudeEnrichment;
    parsed.confidence_score = Math.min(Math.max(parsed.confidence_score, 0), 100) / 100;
    return parsed;
  } catch (err) {
    logger.error("lender_enrichment_claude_exception", { company: record.company_name, error: err instanceof Error ? err.message : "unknown" });
    return null;
  }
}

export async function runLenderEnrichmentWorker(limit = 28): Promise<LenderEnrichmentResult> {
  const result: LenderEnrichmentResult = { processed: 0, enriched: 0, failed: 0, items: [] };
  const env = readServerEnv();

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required for lender enrichment");
  }

  const model = selectAnthropicModel(env, "default");

  // Fetch all lenders (pending_review + approved + outreach_ready — skip rejected)
  const { data: records, error } = await (getSupabaseAdmin() as any)
    .from("lender_discovery_queue")
    .select("id, company_name, website_url, contact_email, funding_range_min, funding_range_max, status")
    .neq("status", "rejected")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch lender queue: ${(error as { message: string }).message}`);
  }

  const lenders: LenderRecord[] = records ?? [];
  logger.info("lender_enrichment_started", { count: lenders.length, model });

  for (const lender of lenders) {
    result.processed++;
    try {
      const enrichment = await callClaudeForLenderEnrichment(lender, env.ANTHROPIC_API_KEY as string, model);

      if (!enrichment) {
        result.failed++;
        result.items.push({ id: lender.id, company_name: lender.company_name, status: "failed", reason: "Claude API returned no enrichment" });
        continue;
      }

      const { error: updateError } = await (getSupabaseAdmin() as any)
        .from("lender_discovery_queue")
        .update({
          intelligence_summary: enrichment.intelligence_summary,
          confidence_score: enrichment.confidence_score,
          states_served: enrichment.states_served,
          metadata: {
            products: enrichment.products,
            min_fico: enrichment.min_fico,
            min_monthly_revenue: enrichment.min_monthly_revenue,
            min_time_in_business_months: enrichment.min_time_in_business_months,
            key_differentiators: enrichment.key_differentiators,
            contact_roles: enrichment.contact_roles,
            enrichment_method: "claude_ai",
            ai_model: model,
            enriched_at: new Date().toISOString(),
            enriched_by: "lender_enrichment_worker"
          } as Json
        })
        .eq("id", lender.id);

      if (updateError) {
        throw new Error((updateError as { message: string }).message);
      }

      await writeAuditLog({
        eventType: "lender_candidate_enriched",
        actorType: "system",
        actorId: "lender_enrichment_worker",
        entityType: "lender" as any,
        entityId: lender.id,
        metadata: {
          company_name: lender.company_name,
          confidence_score: enrichment.confidence_score,
          products: enrichment.products,
          model
        } as Json
      });

      result.enriched++;
      result.items.push({ id: lender.id, company_name: lender.company_name, status: "enriched", confidence_score: enrichment.confidence_score });
      logger.info("lender_enrichment_success", { company: lender.company_name, confidence: enrichment.confidence_score });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error("lender_enrichment_failed", { company: lender.company_name, error: msg });
      result.failed++;
      result.items.push({ id: lender.id, company_name: lender.company_name, status: "failed", reason: msg });
    }
  }

  logger.info("lender_enrichment_done", { processed: result.processed, enriched: result.enriched, failed: result.failed });
  return result;
}
