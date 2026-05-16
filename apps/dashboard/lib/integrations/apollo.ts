import type { Json } from "@operion/shared";
import { readServerEnv } from "@/lib/env";
import { ConfigurationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";

export interface ApolloCompanyLookupInput {
  businessName: string;
  domain?: string | null;
}

export interface ApolloContactLookupInput {
  name?: string | null;
  email?: string | null;
  domain?: string | null;
  organizationName?: string | null;
}

export interface ApolloOutreachSyncInput {
  leadId: string;
  email: string;
  campaignId?: string | null;
  status: string;
  metadata?: Json;
}

export async function lookupCompanyInApollo(input: ApolloCompanyLookupInput) {
  return apolloRequest("organization_search", "/mixed_companies/search", {
    q_organization_name: input.businessName,
    q_organization_domains: input.domain ? [input.domain] : undefined,
    page: 1,
    per_page: 5
  });
}

export async function lookupContactInApollo(input: ApolloContactLookupInput) {
  return apolloRequest("contact_lookup", "/people/match", {
    name: input.name ?? undefined,
    email: input.email ?? undefined,
    domain: input.domain ?? undefined,
    organization_name: input.organizationName ?? undefined
  });
}

export async function enrichLeadWithApollo(input: ApolloCompanyLookupInput & ApolloContactLookupInput) {
  const [company, contact] = await Promise.allSettled([
    lookupCompanyInApollo(input),
    lookupContactInApollo(removeUndefined({
      name: input.name,
      email: input.email,
      domain: input.domain,
      organizationName: input.businessName
    }) as ApolloContactLookupInput)
  ]);

  return {
    company: company.status === "fulfilled" ? company.value : null,
    contact: contact.status === "fulfilled" ? contact.value : null,
    errors: [company, contact]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => (result.reason instanceof Error ? result.reason.message : "Apollo enrichment failed"))
  };
}

export async function syncOutreachToApollo(input: ApolloOutreachSyncInput) {
  return apolloRequest("outreach_sync", "/contacts", {
    email: input.email,
    labels: ["operion_outreach"],
    custom_fields: {
      operion_lead_id: input.leadId,
      operion_campaign_id: input.campaignId ?? null,
      operion_outreach_status: input.status,
      operion_metadata: input.metadata ?? {}
    }
  });
}

async function apolloRequest(operation: string, path: string, body: Record<string, unknown>) {
  const env = readServerEnv();
  if (!env.APOLLO_API_KEY) {
    throw new ConfigurationError("APOLLO_API_KEY is required before Apollo enrichment is enabled");
  }

  const startedAt = Date.now();
  const response = await withRetry(
    async () =>
      fetch(`${env.APOLLO_API_BASE_URL.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-api-key": env.APOLLO_API_KEY as string
        },
        body: JSON.stringify(removeUndefined(body))
      }),
    {
      operation: `apollo.${operation}`
    }
  );

  const text = await response.text();
  const parsed = parseProviderBody(text);
  if (!response.ok) {
    logger.warn("apollo_request_failed", {
      operation,
      status: response.status,
      body: parsed
    });
    throw new ConfigurationError("Apollo request failed", {
      operation,
      status: response.status,
      providerError: parsed
    });
  }

  return {
    operation,
    latency_ms: Date.now() - startedAt,
    data: parsed
  };
}

function removeUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function parseProviderBody(text: string): Json {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as Json;
  } catch {
    return text.slice(0, 500);
  }
}
