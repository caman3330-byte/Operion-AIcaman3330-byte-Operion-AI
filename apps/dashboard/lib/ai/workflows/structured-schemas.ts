import { z } from "zod";

const jsonStringOrNull = { type: ["string", "null"] };
const jsonNumberOrNull = { type: ["number", "null"] };

export const leadExtractionSchema = z.object({
  business_name: z.string(),
  owner_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website_url: z.string().nullable(),
  industry: z.string().nullable(),
  state: z.string().nullable(),
  requested_amount: z.number().nullable(),
  monthly_deposits: z.number().nullable(),
  annual_revenue: z.number().nullable(),
  funding_purpose: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  missing_fields: z.array(z.string())
});

export const leadExtractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    business_name: { type: "string" },
    owner_name: jsonStringOrNull,
    email: jsonStringOrNull,
    phone: jsonStringOrNull,
    website_url: jsonStringOrNull,
    industry: jsonStringOrNull,
    state: jsonStringOrNull,
    requested_amount: jsonNumberOrNull,
    monthly_deposits: jsonNumberOrNull,
    annual_revenue: jsonNumberOrNull,
    funding_purpose: jsonStringOrNull,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    missing_fields: { type: "array", items: { type: "string" } }
  },
  required: [
    "business_name",
    "owner_name",
    "email",
    "phone",
    "website_url",
    "industry",
    "state",
    "requested_amount",
    "monthly_deposits",
    "annual_revenue",
    "funding_purpose",
    "confidence",
    "missing_fields"
  ]
};

export const underwritingSummarySchema = z.object({
  qualification_score: z.number().int().min(0).max(100),
  decision: z.enum(["qualified", "review_required", "declined"]),
  risk_level: z.enum(["low", "medium", "high"]),
  funding_fit: z.enum(["strong", "moderate", "weak"]),
  underwriting_summary: z.string(),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  missing_documents: z.array(z.string()),
  recommended_next_action: z.string()
});

export const underwritingSummaryJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    qualification_score: { type: "integer", minimum: 0, maximum: 100 },
    decision: { type: "string", enum: ["qualified", "review_required", "declined"] },
    risk_level: { type: "string", enum: ["low", "medium", "high"] },
    funding_fit: { type: "string", enum: ["strong", "moderate", "weak"] },
    underwriting_summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    missing_documents: { type: "array", items: { type: "string" } },
    recommended_next_action: { type: "string" }
  },
  required: [
    "qualification_score",
    "decision",
    "risk_level",
    "funding_fit",
    "underwriting_summary",
    "strengths",
    "risks",
    "missing_documents",
    "recommended_next_action"
  ]
};

export const lenderRecommendationsSchema = z.object({
  recommendations: z.array(
    z.object({
      lender_id: z.string().nullable(),
      lender_name: z.string(),
      match_score: z.number().int().min(0).max(100),
      rationale: z.string(),
      required_conditions: z.array(z.string())
    })
  ),
  routing_summary: z.string(),
  requires_approval: z.boolean()
});

export const lenderRecommendationsJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          lender_id: jsonStringOrNull,
          lender_name: { type: "string" },
          match_score: { type: "integer", minimum: 0, maximum: 100 },
          rationale: { type: "string" },
          required_conditions: { type: "array", items: { type: "string" } }
        },
        required: ["lender_id", "lender_name", "match_score", "rationale", "required_conditions"]
      }
    },
    routing_summary: { type: "string" },
    requires_approval: { type: "boolean" }
  },
  required: ["recommendations", "routing_summary", "requires_approval"]
};

export const outreachGenerationSchema = z.object({
  subject: z.string(),
  body_text: z.string(),
  tone: z.enum(["professional", "warm", "direct"]),
  personalization_points: z.array(z.string()),
  compliance_notes: z.array(z.string()),
  requires_approval: z.boolean()
});

export const outreachGenerationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    body_text: { type: "string" },
    tone: { type: "string", enum: ["professional", "warm", "direct"] },
    personalization_points: { type: "array", items: { type: "string" } },
    compliance_notes: { type: "array", items: { type: "string" } },
    requires_approval: { type: "boolean" }
  },
  required: ["subject", "body_text", "tone", "personalization_points", "compliance_notes", "requires_approval"]
};

export const crmActivitySchema = z.object({
  activity_type: z.enum(["note", "call", "email", "status_change", "document_request", "lender_update"]),
  subject: z.string(),
  body: z.string(),
  next_step: z.string().nullable(),
  priority: z.enum(["low", "medium", "high"]),
  sentiment: z.enum(["positive", "neutral", "negative", "unknown"])
});

export const crmActivityJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    activity_type: { type: "string", enum: ["note", "call", "email", "status_change", "document_request", "lender_update"] },
    subject: { type: "string" },
    body: { type: "string" },
    next_step: jsonStringOrNull,
    priority: { type: "string", enum: ["low", "medium", "high"] },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative", "unknown"] }
  },
  required: ["activity_type", "subject", "body", "next_step", "priority", "sentiment"]
};
