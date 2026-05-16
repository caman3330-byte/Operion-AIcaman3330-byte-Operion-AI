import type { BusinessContact, Lead, OutreachCampaign, OutreachSequence } from "@operion/shared";
import { estimateAnthropicCost, recordApiUsage } from "@/lib/api-usage";
import { readServerEnv } from "@/lib/env";
import { ConfigurationError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface GenerateOutreachEmailInput {
  lead: Lead;
  contact?: BusinessContact | null;
  campaign?: OutreachCampaign | null;
  sequence?: OutreachSequence | null;
}

export interface GeneratedOutreachEmail {
  subject: string;
  html_body: string;
  text_body: string;
  compliance_notes: string[];
}

export async function generateOutreachEmail(input: GenerateOutreachEmailInput): Promise<GeneratedOutreachEmail> {
  const env = readServerEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new ConfigurationError("ANTHROPIC_API_KEY is required for AI SDR email generation");
  }

  const startedAt = Date.now();
  const leadContext = JSON.stringify({
    business_name: input.lead.business_name,
    contact_name: input.contact?.full_name ?? input.lead.contact_name,
    contact_title: input.contact?.title,
    email: input.contact?.email ?? input.lead.email,
    industry: input.lead.industry,
    state: input.lead.state,
    annual_revenue_est: input.lead.annual_revenue_est,
    time_in_business_years: input.lead.time_in_business_years,
    qualification_score: input.lead.qualification_score,
    tier: input.lead.tier,
    campaign: input.campaign?.name,
    sequence_step: input.sequence?.step_number,
    subject_template: input.sequence?.subject_template,
    body_template: input.sequence?.body_template
  });

  try {
    const result = await withRetry(
      async () => {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY as string,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: env.ANTHROPIC_MODEL,
            max_tokens: 900,
            temperature: 0.2,
            system:
              "You are Operion AI's compliant MCA/business funding SDR copywriter. Generate concise, factual outreach. Do not guarantee approvals, rates, funding amounts, or outcomes. Do not fabricate facts. Return only valid JSON.",
            messages: [
              {
                role: "user",
                content: `Create a first-touch business funding outreach email for this lead context.\n\n${leadContext}\n\nReturn JSON with keys: subject, html_body, text_body, compliance_notes.`
              }
            ]
          })
        });

        if (!response.ok) {
          throw new Error(`Anthropic outreach request failed with ${response.status}`);
        }

        return (await response.json()) as AnthropicResponse;
      },
      { operation: "anthropic.generateOutreachEmail" }
    );

    const text = result.content?.find((content) => content.type === "text")?.text;
    if (!text) {
      throw new ValidationError("Anthropic outreach response did not include text content");
    }

    const inputTokens = result.usage?.input_tokens ?? 0;
    const outputTokens = result.usage?.output_tokens ?? 0;
    await recordApiUsage({
      service: "anthropic",
      operation: "generate_outreach_email",
      leadId: input.lead.id,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateAnthropicCost(inputTokens, outputTokens),
      success: true,
      latencyMs: Date.now() - startedAt
    });

    return normalizeGeneratedEmail(parseJsonBlock(text));
  } catch (error) {
    logger.error("anthropic_outreach_generation_failed", { leadId: input.lead.id, error });
    await recordApiUsage({
      service: "anthropic",
      operation: "generate_outreach_email",
      leadId: input.lead.id,
      success: false,
      latencyMs: Date.now() - startedAt
    });
    throw error;
  }
}

function parseJsonBlock(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1]?.trim() ?? trimmed;
  return JSON.parse(jsonText) as Record<string, unknown>;
}

function normalizeGeneratedEmail(payload: Record<string, unknown>): GeneratedOutreachEmail {
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const htmlBody = typeof payload.html_body === "string" ? payload.html_body.trim() : "";
  const textBody = typeof payload.text_body === "string" ? payload.text_body.trim() : "";
  const complianceNotes = Array.isArray(payload.compliance_notes)
    ? payload.compliance_notes.filter((note): note is string => typeof note === "string")
    : [];

  if (!subject || !htmlBody || !textBody) {
    throw new ValidationError("Generated outreach email must include subject, html_body, and text_body");
  }

  return {
    subject: subject.slice(0, 160),
    html_body: ensureHtml(htmlBody),
    text_body: textBody,
    compliance_notes: complianceNotes
  };
}

function ensureHtml(value: string) {
  if (/<[a-z][\s\S]*>/i.test(value)) {
    return value;
  }

  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
