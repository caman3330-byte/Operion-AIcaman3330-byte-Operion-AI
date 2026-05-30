import type { Json } from "@operion/shared";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { readServerEnv } from "@/lib/env";

export interface LenderDiscoveryAgentResult {
  discovered: number;
  skipped: number;
  enriched: number;
  failed: number;
  items: Array<{
    company_name: string;
    website_url: string;
    status: "discovered" | "skipped" | "failed";
    confidence_score?: number;
    reason?: string;
  }>;
}

interface LenderSeed {
  company_name: string;
  website_url: string;
  contact_email: string | null;
  funding_range_min: number;
  funding_range_max: number;
  known_products: string[];
  category: "direct_mca" | "business_loan" | "marketplace" | "iso_network";
}

// Curated list of real MCA lenders, business funding companies, and ISO networks
// Sources: MCA industry directories, public lender databases, funding company listings
const LENDER_SEEDS: LenderSeed[] = [
  // Direct MCA Funders
  {
    company_name: "Kapitus",
    website_url: "https://kapitus.com",
    contact_email: "partners@kapitus.com",
    funding_range_min: 10000,
    funding_range_max: 5000000,
    known_products: ["MCA", "business_loan", "revenue_based_financing", "equipment_financing"],
    category: "direct_mca"
  },
  {
    company_name: "Credibly",
    website_url: "https://credibly.com",
    contact_email: null,
    funding_range_min: 5000,
    funding_range_max: 600000,
    known_products: ["MCA", "business_loan", "working_capital"],
    category: "direct_mca"
  },
  {
    company_name: "Rapid Finance",
    website_url: "https://rapidfinance.com",
    contact_email: null,
    funding_range_min: 5000,
    funding_range_max: 1000000,
    known_products: ["MCA", "business_loan", "line_of_credit", "equipment_financing"],
    category: "direct_mca"
  },
  {
    company_name: "Fora Financial",
    website_url: "https://forafinancial.com",
    contact_email: "iso@forafinancial.com",
    funding_range_min: 5000,
    funding_range_max: 1400000,
    known_products: ["MCA", "small_business_loan"],
    category: "direct_mca"
  },
  {
    company_name: "Kalamata Capital Group",
    website_url: "https://kalamatacapital.com",
    contact_email: null,
    funding_range_min: 5000,
    funding_range_max: 500000,
    known_products: ["MCA", "revenue_based_financing"],
    category: "direct_mca"
  },
  {
    company_name: "Can Capital",
    website_url: "https://cancapital.com",
    contact_email: null,
    funding_range_min: 2500,
    funding_range_max: 250000,
    known_products: ["MCA", "business_loan"],
    category: "direct_mca"
  },
  {
    company_name: "Yellowstone Capital",
    website_url: "https://yellowstonecap.com",
    contact_email: "iso@yellowstonecap.com",
    funding_range_min: 5000,
    funding_range_max: 2000000,
    known_products: ["MCA", "revenue_based_financing"],
    category: "direct_mca"
  },
  {
    company_name: "Delta Bridge Funding",
    website_url: "https://deltabridgefunding.com",
    contact_email: null,
    funding_range_min: 10000,
    funding_range_max: 5000000,
    known_products: ["MCA", "revenue_based_financing", "working_capital"],
    category: "direct_mca"
  },
  {
    company_name: "Pearl Capital",
    website_url: "https://pearlcapital.net",
    contact_email: "iso@pearlcapital.net",
    funding_range_min: 5000,
    funding_range_max: 250000,
    known_products: ["MCA"],
    category: "direct_mca"
  },
  {
    company_name: "Cresthill Capital",
    website_url: "https://cresthillcapital.com",
    contact_email: null,
    funding_range_min: 5000,
    funding_range_max: 500000,
    known_products: ["MCA", "revenue_based_financing"],
    category: "direct_mca"
  },
  {
    company_name: "CFG Merchant Solutions",
    website_url: "https://cfgmerchants.com",
    contact_email: "iso@cfgmerchants.com",
    funding_range_min: 10000,
    funding_range_max: 4000000,
    known_products: ["MCA", "revenue_based_financing"],
    category: "direct_mca"
  },
  {
    company_name: "Mulligan Funding",
    website_url: "https://mulliganfunding.com",
    contact_email: null,
    funding_range_min: 5000,
    funding_range_max: 2000000,
    known_products: ["MCA", "business_loan", "working_capital"],
    category: "direct_mca"
  },
  {
    company_name: "ForwardLine Financial",
    website_url: "https://forwardline.com",
    contact_email: "partnerships@forwardline.com",
    funding_range_min: 10000,
    funding_range_max: 500000,
    known_products: ["MCA", "business_loan"],
    category: "direct_mca"
  },
  {
    company_name: "Capify",
    website_url: "https://capify.com",
    contact_email: null,
    funding_range_min: 5000,
    funding_range_max: 500000,
    known_products: ["MCA", "business_loan"],
    category: "direct_mca"
  },
  {
    company_name: "Expansion Capital Group",
    website_url: "https://expansioncapitalgroup.com",
    contact_email: "iso@expansioncapitalgroup.com",
    funding_range_min: 5000,
    funding_range_max: 500000,
    known_products: ["MCA", "revenue_based_financing"],
    category: "direct_mca"
  },
  // Business Loan + MCA Hybrid Providers
  {
    company_name: "OnDeck Capital",
    website_url: "https://ondeck.com",
    contact_email: null,
    funding_range_min: 5000,
    funding_range_max: 250000,
    known_products: ["business_loan", "line_of_credit"],
    category: "business_loan"
  },
  {
    company_name: "National Funding",
    website_url: "https://nationalfunding.com",
    contact_email: null,
    funding_range_min: 5000,
    funding_range_max: 500000,
    known_products: ["MCA", "business_loan", "equipment_financing", "working_capital"],
    category: "business_loan"
  },
  {
    company_name: "Reliant Funding",
    website_url: "https://reliantfunding.com",
    contact_email: "iso@reliantfunding.com",
    funding_range_min: 5000,
    funding_range_max: 400000,
    known_products: ["MCA", "business_loan"],
    category: "business_loan"
  },
  {
    company_name: "Headway Capital",
    website_url: "https://headwaycapital.com",
    contact_email: null,
    funding_range_min: 5000,
    funding_range_max: 100000,
    known_products: ["line_of_credit"],
    category: "business_loan"
  },
  {
    company_name: "Balboa Capital",
    website_url: "https://balboacapital.com",
    contact_email: null,
    funding_range_min: 3000,
    funding_range_max: 250000,
    known_products: ["equipment_financing", "business_loan", "working_capital"],
    category: "business_loan"
  },
  {
    company_name: "BlueVine",
    website_url: "https://bluevine.com",
    contact_email: null,
    funding_range_min: 5000,
    funding_range_max: 250000,
    known_products: ["line_of_credit", "invoice_factoring", "business_banking"],
    category: "business_loan"
  },
  {
    company_name: "Fundbox",
    website_url: "https://fundbox.com",
    contact_email: null,
    funding_range_min: 1000,
    funding_range_max: 150000,
    known_products: ["line_of_credit", "invoice_financing"],
    category: "business_loan"
  },
  // Marketplace / Aggregator Lenders
  {
    company_name: "Lendio",
    website_url: "https://lendio.com",
    contact_email: "partners@lendio.com",
    funding_range_min: 500,
    funding_range_max: 5000000,
    known_products: ["MCA", "business_loan", "SBA_loan", "equipment_financing", "line_of_credit"],
    category: "marketplace"
  },
  {
    company_name: "Biz2Credit",
    website_url: "https://biz2credit.com",
    contact_email: null,
    funding_range_min: 25000,
    funding_range_max: 6000000,
    known_products: ["MCA", "business_loan", "SBA_loan", "equipment_financing"],
    category: "marketplace"
  },
  {
    company_name: "Funding Circle",
    website_url: "https://fundingcircle.com",
    contact_email: null,
    funding_range_min: 25000,
    funding_range_max: 500000,
    known_products: ["business_loan"],
    category: "marketplace"
  },
  {
    company_name: "SmartBiz Loans",
    website_url: "https://smartbizloans.com",
    contact_email: null,
    funding_range_min: 30000,
    funding_range_max: 5000000,
    known_products: ["SBA_loan", "business_loan"],
    category: "marketplace"
  },
  // ISO Networks
  {
    company_name: "United Capital Source",
    website_url: "https://unitedcapitalsource.com",
    contact_email: "info@unitedcapitalsource.com",
    funding_range_min: 5000,
    funding_range_max: 5000000,
    known_products: ["MCA", "business_loan", "SBA_loan", "equipment_financing", "invoice_factoring"],
    category: "iso_network"
  },
  {
    company_name: "National Business Capital",
    website_url: "https://nationalbusinesscapital.com",
    contact_email: null,
    funding_range_min: 10000,
    funding_range_max: 5000000,
    known_products: ["MCA", "business_loan", "equipment_financing", "line_of_credit"],
    category: "iso_network"
  }
];

interface AiEnrichment {
  intelligence_summary: string;
  confidence_score: number;
  products: string[];
  min_fico: number | null;
  min_monthly_revenue: number | null;
  min_time_in_business_months: number | null;
  states_served: string[];
  key_differentiators: string[];
}

async function callClaudeForEnrichment(seed: LenderSeed): Promise<AiEnrichment | null> {
  const env = readServerEnv();
  if (!env.ANTHROPIC_API_KEY) {
    logger.warn("lender_discovery_agent_no_api_key", { company: seed.company_name });
    return null;
  }

  const systemPrompt = `You are a senior analyst at a business funding brokerage with deep expertise in the US MCA (Merchant Cash Advance), working capital, and business lending industry. You have comprehensive knowledge of lender profiles, underwriting criteria, funding products, and market positioning across hundreds of funding companies.`;

  const userPrompt = `Analyze this business funding company and provide structured lender intelligence for our discovery system.

Company: ${seed.company_name}
Website: ${seed.website_url}
Category: ${seed.category.replaceAll("_", " ")}
Known products: ${seed.known_products.join(", ")}
Known funding range: $${seed.funding_range_min.toLocaleString()} – $${seed.funding_range_max.toLocaleString()}

Return ONLY a valid JSON object matching this exact schema (no markdown, no explanation):
{
  "intelligence_summary": "2-3 sentence professional summary covering this company's position in the MCA/business funding market, their typical merchant profile, speed of funding, and any notable underwriting characteristics",
  "confidence_score": <integer 60-95, higher for larger more established companies with clear market presence>,
  "products": ["normalized array of products from: MCA, business_loan, line_of_credit, equipment_financing, invoice_factoring, SBA_loan, revenue_based_financing, working_capital, business_banking"],
  "min_fico": <estimated minimum FICO score integer, typically 500-650 for MCA lenders, or null if they are known to fund bad credit>,
  "min_monthly_revenue": <estimated minimum monthly revenue/deposits in USD integer, e.g. 8000>,
  "min_time_in_business_months": <estimated minimum months in business integer, e.g. 6>,
  "states_served": ["2-letter state codes array — use all 50 US states if national, or list specific states if they have known geographic restrictions"],
  "key_differentiators": ["2-4 specific factors that make this lender distinct in the market"]
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 900,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logger.error("lender_discovery_ai_request_failed", { status: response.status, company: seed.company_name, error: errText });
      return null;
    }

    const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const rawText = data.content?.find((c) => c.type === "text")?.text ?? "";
    // Strip markdown code fences if present
    const cleanedText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    if (!cleanedText) return null;

    const parsed = JSON.parse(cleanedText) as AiEnrichment;

    // Clamp confidence_score to 0.0-1.0
    parsed.confidence_score = Math.min(Math.max(parsed.confidence_score, 0), 100) / 100;

    return parsed;
  } catch (err) {
    logger.error("lender_discovery_ai_parse_failed", {
      company: seed.company_name,
      error: err instanceof Error ? err.message : "unknown"
    });
    return null;
  }
}

function buildFallbackEnrichment(seed: LenderSeed): AiEnrichment {
  const isLargeLender = seed.funding_range_max >= 1000000;
  const isMca = seed.known_products.includes("MCA");

  return {
    intelligence_summary: `${seed.company_name} is a ${seed.category.replaceAll("_", " ")} providing ${seed.known_products.join(", ")} with funding from $${(seed.funding_range_min / 1000).toFixed(0)}K to $${(seed.funding_range_max / 1000).toFixed(0)}K. Pending AI enrichment — founder review required before activation.`,
    confidence_score: isLargeLender ? 0.72 : 0.60,
    products: seed.known_products,
    min_fico: isMca ? 500 : 580,
    min_monthly_revenue: 10000,
    min_time_in_business_months: 6,
    states_served: ["CA", "TX", "FL", "NY", "IL", "PA", "OH", "GA", "NC", "MI"],
    key_differentiators: [`${seed.category.replaceAll("_", " ")} — see website for full criteria`]
  };
}

export async function runLenderDiscoveryAgent(limit = 10): Promise<LenderDiscoveryAgentResult> {
  const result: LenderDiscoveryAgentResult = { discovered: 0, skipped: 0, enriched: 0, failed: 0, items: [] };

  // Fetch existing company names for deduplication
  const { data: existing } = await (getSupabaseAdmin() as any)
    .from("lender_discovery_queue")
    .select("company_name, website_url");

  const existingNames = new Set<string>(
    (existing ?? []).map((r: { company_name: string }) => r.company_name.toLowerCase().trim())
  );
  const existingUrls = new Set<string>(
    (existing ?? []).map((r: { website_url: string | null }) => (r.website_url ?? "").toLowerCase().trim()).filter(Boolean)
  );

  // Filter out seeds already in queue (true dedup), then slice to limit
  const newSeeds = LENDER_SEEDS.filter((seed) => {
    const nameDupe = existingNames.has(seed.company_name.toLowerCase().trim());
    const urlDupe = existingUrls.has(seed.website_url.toLowerCase().trim());
    return !nameDupe && !urlDupe;
  });
  const seedsToProcess = newSeeds.slice(0, limit);

  // skipped = seeds confirmed already in DB (dedup hits), NOT seeds truncated by limit
  const alreadyPresent = LENDER_SEEDS.length - newSeeds.length;
  result.skipped = alreadyPresent;

  logger.info("lender_discovery_agent_started", {
    total_seeds: LENDER_SEEDS.length,
    already_in_queue: alreadyPresent,
    new_to_process: newSeeds.length,
    processing_now: seedsToProcess.length
  });

  for (const seed of seedsToProcess) {
    try {
      // Call Claude for AI enrichment; fall back to rule-based if unavailable
      const claudeResult = await callClaudeForEnrichment(seed);
      const enrichment = claudeResult ?? buildFallbackEnrichment(seed);
      const usedAi = claudeResult !== null;

      // Insert into lender_discovery_queue
      const { data: inserted, error: insertError } = await (getSupabaseAdmin() as any)
        .from("lender_discovery_queue")
        .insert({
          company_name: seed.company_name,
          website_url: seed.website_url,
          contact_email: seed.contact_email,
          contact_phone: null,
          states_served: enrichment.states_served,
          funding_range_min: seed.funding_range_min,
          funding_range_max: seed.funding_range_max,
          intelligence_summary: enrichment.intelligence_summary,
          confidence_score: enrichment.confidence_score,
          discovery_source: "directory",
          status: "pending_review",
          metadata: {
            products: enrichment.products,
            min_fico: enrichment.min_fico,
            min_monthly_revenue: enrichment.min_monthly_revenue,
            min_time_in_business_months: enrichment.min_time_in_business_months,
            key_differentiators: enrichment.key_differentiators,
            category: seed.category,
            enrichment_method: usedAi ? "claude_ai" : "rule_based_fallback",
            ai_model: usedAi ? (process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6") : null,
            discovered_at: new Date().toISOString(),
            discovered_by: "lender_discovery_agent"
          } as Json
        })
        .select("id")
        .single();

      if (insertError) {
        throw new Error((insertError as { message: string }).message);
      }

      const insertedId = (inserted as { id: string }).id;

      await writeAuditLog({
        eventType: "lender_candidate_discovered",
        actorType: "system",
        actorId: "lender_discovery_agent",
        entityType: "lender" as any,
        entityId: insertedId,
        metadata: {
          company_name: seed.company_name,
          website_url: seed.website_url,
          confidence_score: enrichment.confidence_score,
          enrichment_method: usedAi ? "claude_ai" : "rule_based_fallback",
          products: enrichment.products
        } as Json
      });

      result.discovered++;
      if (usedAi) result.enriched++;
      result.items.push({
        company_name: seed.company_name,
        website_url: seed.website_url,
        status: "discovered",
        confidence_score: enrichment.confidence_score
      });

      logger.info("lender_discovery_agent_discovered", {
        company: seed.company_name,
        confidence: enrichment.confidence_score,
        enrichment_method: usedAi ? "claude_ai" : "fallback"
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error("lender_discovery_agent_seed_failed", { company: seed.company_name, error: msg });
      result.failed++;
      result.items.push({
        company_name: seed.company_name,
        website_url: seed.website_url,
        status: "failed",
        reason: msg
      });
    }
  }

  logger.info("lender_discovery_agent_done", {
    discovered: result.discovered,
    skipped: result.skipped,
    enriched: result.enriched,
    failed: result.failed
  });

  return result;
}
