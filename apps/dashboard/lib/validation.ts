import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const uuidSchema = z.string().uuid();

export const leadCreateSchema = z.object({
  business_name: z.string().min(1),
  contact_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  annual_revenue_est: z.number().nonnegative().optional().nullable(),
  time_in_business_years: z.number().nonnegative().optional().nullable(),
  apollo_id: z.string().optional().nullable(),
  status: z
    .enum([
      "raw",
      "enriched",
      "scored",
      "qualified",
      "nurture",
      "archived",
      "distributed",
      "pending_approval",
      "rejected_distribution",
      "blacklisted",
      "qualification_error",
      "reviewing",
      "submitted",
      "approved",
      "funded",
      "rejected",
      "reviewed",
      "routed"
    ])
    .optional()
});

export const leadPatchSchema = leadCreateSchema.partial().extend({
  qualification_score: z.number().int().min(0).max(100).optional().nullable(),
  tier: z.enum(["A", "B", "C", "D"]).optional().nullable(),
  outreach_started: z.boolean().optional(),
  outreach_paused: z.boolean().optional(),
  blacklisted: z.boolean().optional(),
  distribution_approved_at: z.string().datetime().optional().nullable(),
  processing_error: z.boolean().optional(),
  processing_error_detail: z.string().optional().nullable(),
  distributed_at: z.string().datetime().optional().nullable()
});

export const lenderCreateSchema = z.object({
  company_name: z.string().min(1),
  contact_email: z.string().email().optional().nullable(),
  webhook_url: z.string().url().optional().nullable(),
  website_url: z.string().url().optional().nullable(),
  contact_page_url: z.string().url().optional().nullable(),
  broker_program_url: z.string().url().optional().nullable(),
  funding_products: z.array(z.string()).optional().nullable(),
  funding_range_min: z.number().nonnegative().optional().nullable(),
  funding_range_max: z.number().nonnegative().optional().nullable(),
  industries_served: z.array(z.string()).optional().nullable(),
  states_served: z.array(z.string()).optional().nullable(),
  minimum_requirements: z.record(z.any()).optional(),
  public_contact_methods: z.record(z.any()).optional(),
  intelligence_summary: z.string().optional().nullable(),
  funding_criteria_summary: z.string().optional().nullable(),
  target_merchant_profile: z.string().optional().nullable(),
  risk_level: z.string().optional().nullable(),
  estimated_responsiveness: z.string().optional().nullable(),
  intelligence_notes: z.string().optional().nullable(),
  lender_tier: z.enum(["A", "B", "C"]).optional(),
  acquisition_stage: z.enum([
    "Discovered",
    "Enriched",
    "Pending Review",
    "Approved",
    "Outreach Ready",
    "Contacted",
    "Responded",
    "Partnered",
    "Inactive"
  ]).optional(),
  approval_status: z.enum(["pending_review", "approved", "rejected", "archived"]).optional(),
  lender_status: z.enum(["pending_review", "approved", "active", "suspended"]).optional(),
  outreach_history: z.any().optional(),
  outreach_drafts: z.any().optional(),
  min_monthly_revenue: z.number().nonnegative().optional().nullable(),
  min_months_in_business: z.number().int().nonnegative().optional().nullable(),
  min_fico: z.number().int().min(300).max(850).optional().nullable(),
  max_funding: z.number().nonnegative().optional().nullable(),
  industry_restrictions: z.array(z.string()).optional().nullable(),
  state_restrictions: z.array(z.string()).optional().nullable(),
  archived_at: z.string().datetime().optional().nullable(),
  criteria_industries: z.array(z.string()).optional().nullable(),
  criteria_min_revenue: z.number().nonnegative().optional().nullable(),
  criteria_max_revenue: z.number().nonnegative().optional().nullable(),
  price_per_lead: z.number().nonnegative().optional().nullable(),
  active: z.boolean().optional(),
  whitelisted: z.boolean().optional()
});

export const lenderUpdateSchema = lenderCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one lender field is required"
});

export const qualifySchema = z
  .object({
    lead_id: uuidSchema.optional(),
    lead_ids: z.array(uuidSchema).min(1).max(50).optional()
  })
  .refine((value) => Boolean(value.lead_id || value.lead_ids), {
    message: "lead_id or lead_ids is required"
  });

export const distributeSchema = z.object({
  lead_id: uuidSchema,
  lender_ids: z.array(uuidSchema).min(1).optional()
});

export const overrideSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("override_score"),
    score: z.number().int().min(0).max(100),
    reason: z.string().min(1)
  }),
  z.object({
    action: z.literal("blacklist"),
    reason: z.string().min(1)
  }),
  z.object({
    action: z.literal("pause_outreach"),
    reason: z.string().optional()
  }),
  z.object({
    action: z.literal("force_archive"),
    reason: z.string().optional()
  })
]);

export const promptVersionCreateSchema = z.object({
  label: z.string().optional().nullable(),
  system_prompt: z.string().min(1),
  user_prompt_template: z.string().min(1),
  scoring_weights: z.record(z.number()).optional().nullable(),
  notes: z.string().optional().nullable()
});

export const alertResolveSchema = z.object({
  resolved: z.literal(true)
});

export const managerRunCreateSchema = z.object({
  objective: z.string().min(10).max(4000),
  context: z.record(z.unknown()).optional().nullable()
});

export const leadSourceCreateSchema = z.object({
  source_key: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  source_type: z.enum(["apollo", "google_maps", "directory", "website", "manual_upload", "n8n", "api"]),
  description: z.string().optional().nullable(),
  config: z.record(z.unknown()).optional().default({}),
  active: z.boolean().optional()
});

export const acquisitionJobCreateSchema = z.object({
  source_key: z.string().min(1).optional().nullable(),
  source_id: uuidSchema.optional().nullable(),
  job_type: z.enum([
    "business_discovery",
    "lead_ingestion",
    "enrichment",
    "contact_extraction",
    "deduplication",
    "quality_scoring",
    "outreach_prep"
  ]),
  assigned_agent_key: z.string().min(1).optional().nullable(),
  parameters: z.record(z.unknown()).optional().default({}),
  run_now: z.boolean().optional().default(false)
});

const rawBusinessLeadSchema = z.object({
  source_record_id: z.string().optional().nullable(),
  business_name: z.string().min(1),
  contact_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  website_url: z.string().url().optional().nullable(),
  industry: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  annual_revenue_est: z.number().nonnegative().optional().nullable(),
  time_in_business_years: z.number().nonnegative().optional().nullable(),
  employee_count: z.number().int().nonnegative().optional().nullable(),
  source: z.string().optional().nullable(),
  raw_payload: z.record(z.unknown()).optional().default({})
});

export const acquisitionIngestSchema = z.object({
  source_key: z.string().min(1),
  job_id: uuidSchema.optional().nullable(),
  records: z.array(rawBusinessLeadSchema).min(1).max(250)
});

export const leadEnrichmentRunSchema = z.object({
  lead_id: uuidSchema,
  requested_by: z.string().min(1).optional().default("founder")
});

export const outreachCampaignCreateSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().optional().nullable(),
  status: z.enum(["draft", "pending_approval", "active", "paused", "completed", "archived"]).optional(),
  audience_filter: z.record(z.unknown()).optional().default({})
});

export const outreachSequenceCreateSchema = z.object({
  campaign_id: uuidSchema,
  step_number: z.number().int().min(1).max(12),
  delay_hours: z.number().int().min(0).max(24 * 90).optional().default(0),
  subject_template: z.string().min(1).max(240),
  body_template: z.string().min(1),
  channel: z.string().min(1).optional().default("email"),
  send_window: z.record(z.unknown()).optional().default({}),
  requires_approval: z.boolean().optional().default(true),
  active: z.boolean().optional().default(true)
});

export const sdrPrepareSchema = z.object({
  lead_id: uuidSchema,
  campaign_id: uuidSchema.optional().nullable(),
  created_by_agent_key: z.string().min(1).optional().nullable()
});

export const outreachReplyCreateSchema = z.object({
  from_email: z.string().email(),
  subject: z.string().optional().nullable(),
  body_text: z.string().optional().nullable(),
  body_html: z.string().optional().nullable(),
  provider_message_id: z.string().optional().nullable(),
  campaign_id: uuidSchema.optional().nullable(),
  lead_id: uuidSchema.optional().nullable(),
  contact_id: uuidSchema.optional().nullable(),
  raw_payload: z.record(z.unknown()).optional().default({})
});

export const workerTickSchema = z.object({
  worker_id: z.string().min(1).optional().default("local-worker"),
  limit: z.number().int().min(1).max(50).optional().default(10)
});

export const simulationIndustrySchema = z.enum([
  "trucking",
  "logistics",
  "construction",
  "ecommerce",
  "restaurants",
  "retail",
  "healthcare",
  "manufacturing"
]);

export const simulationLeadGenerateSchema = z.object({
  batch_size: z.union([z.literal(10), z.literal(100), z.literal(1000), z.literal(10000)]),
  industries: z.array(simulationIndustrySchema).optional(),
  seed: z.string().min(1).optional()
});

export const simulationRunSchema = simulationLeadGenerateSchema.extend({
  mode: z.enum(["standard", "stress", "replay"]).optional().default("standard"),
  pipeline_limit: z.number().int().min(1).optional()
});

export const providerUpdateSchema = z.object({
  provider_key: z.string().min(1),
  enabled: z.boolean()
});

export const workerControlSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("pause"),
    reason: z.string().optional().default("Paused from internal testing dashboard")
  }),
  z.object({
    action: z.literal("resume"),
    reason: z.string().optional().default("Resumed from internal testing dashboard")
  }),
  z.object({
    action: z.literal("stress_mode"),
    enabled: z.boolean(),
    reason: z.string().optional().default("Stress mode updated from internal testing dashboard")
  })
]);

export const replayWorkflowSchema = z.object({
  simulation_run_id: uuidSchema,
  pipeline_limit: z.number().int().min(1).max(1000).optional()
});

export const clearTestDataSchema = z.object({
  confirmation: z.literal("CLEAR_TEST_DATA")
});

export const readinessReportSchema = z.object({
  simulation_run_id: uuidSchema.optional().nullable()
});

export const fundingApplicationSchema = z.object({
  business_name: z.string().min(2).max(180),
  industry: z.string().min(2).max(120),
  business_address: z.preprocess(emptyToUndefined, z.string().max(240).optional().nullable()),
  time_in_business_months: z.coerce.number().int().nonnegative().optional().nullable(),
  tax_id_last4: z.preprocess(emptyToUndefined, z.string().max(20).optional().nullable()),
  state: z.preprocess(emptyToUndefined, z.string().min(2).max(40).optional().nullable()),
  website_url: z.preprocess(emptyToUndefined, z.string().url().optional().nullable()),
  annual_revenue: z.coerce.number().nonnegative().optional().nullable(),
  monthly_revenue: z.coerce.number().nonnegative().optional().nullable(),
  monthly_deposits: z.coerce.number().nonnegative(),
  requested_amount: z.coerce.number().positive(),
  credit_score_range: z.enum(["under_550", "550_599", "600_649", "650_699", "700_plus", "unknown"]),
  owner_name: z.string().min(2).max(160),
  contact_email: z.string().email(),
  contact_phone: z.string().min(7).max(40),
  ownership_percentage: z.coerce.number().min(0).max(100).optional().nullable(),
  bank_name: z.preprocess(emptyToUndefined, z.string().max(160).optional().nullable()),
  average_daily_balance: z.coerce.number().nonnegative().optional().nullable(),
  funding_purpose: z.preprocess(emptyToUndefined, z.string().max(1000).optional().nullable()),
  product_type: z.enum(["mca", "business_loan", "line_of_credit", "equipment_financing", "unknown"]).optional().default("mca"),
  consent_to_contact: z.boolean().optional().default(true)
});
