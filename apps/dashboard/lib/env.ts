import { z } from "zod";
import { ConfigurationError } from "@/lib/errors";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalEmail = z.preprocess(emptyToUndefined, z.string().email().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ADMIN_EMAIL: optionalEmail,
  OPERION_INTERNAL_API_KEY: z.preprocess(emptyToUndefined, z.string().min(24).optional()),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().min(1).default("claude-3-5-sonnet-latest"),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_COST_PER_1K_INPUT_TOKENS: z.coerce.number().nonnegative().default(0),
  OPENAI_COST_PER_1K_OUTPUT_TOKENS: z.coerce.number().nonnegative().default(0),
  SENDGRID_API_KEY: optionalString,
  SENDGRID_FROM_EMAIL: optionalEmail,
  CRM_WEBHOOK_URL: optionalUrl,
  APOLLO_API_KEY: optionalString,
  APOLLO_API_BASE_URL: z.string().url().default("https://api.apollo.io/api/v1"),
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  SLACK_WEBHOOK_URL: optionalUrl,
  N8N_WEBHOOK_BASE_URL: optionalUrl,
  ANTHROPIC_COST_PER_1K_INPUT_TOKENS: z.coerce.number().nonnegative().default(0.003),
  ANTHROPIC_COST_PER_1K_OUTPUT_TOKENS: z.coerce.number().nonnegative().default(0.015),
  APOLLO_COST_PER_ENRICHMENT_CALL: z.coerce.number().nonnegative().default(0.08),
  SENDGRID_COST_PER_EMAIL: z.coerce.number().nonnegative().default(0.001),
  MONTHLY_API_BUDGET_USD: z.coerce.number().positive().default(500)
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1)
});

const supabaseServerSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1)
});

export function readServerEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new ConfigurationError("Required server environment variables are missing or invalid", parsed.error.flatten());
  }

  return parsed.data;
}

export function readSupabaseServerEnv() {
  const parsed = supabaseServerSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new ConfigurationError("Supabase server environment variables are missing or invalid", parsed.error.flatten());
  }

  return parsed.data;
}

export function readPublicEnv() {
  const parsed = publicSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new ConfigurationError("Required public Supabase environment variables are missing or invalid", parsed.error.flatten());
  }

  return parsed.data;
}

export function getConfigurationStatus() {
  return {
    supabase:
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
      Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    auth: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    sendgrid: Boolean(process.env.SENDGRID_API_KEY) && Boolean(process.env.SENDGRID_FROM_EMAIL),
    crm: Boolean(process.env.CRM_WEBHOOK_URL),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    apollo: Boolean(process.env.APOLLO_API_KEY),
    internalApi: Boolean(process.env.OPERION_INTERNAL_API_KEY),
    slack: Boolean(process.env.SLACK_WEBHOOK_URL),
    n8n: Boolean(process.env.N8N_WEBHOOK_BASE_URL)
  };
}

export function requireEnvValue(name: keyof z.infer<typeof serverSchema>) {
  const value = process.env[name];
  if (!value) {
    throw new ConfigurationError(`${name} is required for this operation`);
  }

  return value;
}
