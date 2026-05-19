# Production Environment Variables Checklist

## Required (server, production-only)
- NEXT_PUBLIC_SUPABASE_URL : present
- NEXT_PUBLIC_SUPABASE_ANON_KEY : present
- SUPABASE_SERVICE_ROLE_KEY : present

## AI (required for AI workflows)
- ANTHROPIC_API_KEY : present (preferred for Claude workflows)
- ANTHROPIC_MODEL : present (default provided)
- OPENAI_API_KEY : MISSING (optional unless using OpenAI provider)
- OPENAI_MODEL : defaulted

## Email / Outreach (optional but recommended in production)
- SENDGRID_API_KEY : MISSING
- SENDGRID_FROM_EMAIL : MISSING

## Lead enrichment (optional)
- APOLLO_API_KEY : MISSING

## Payments (optional until billing is enabled)
- STRIPE_SECRET_KEY : MISSING
- STRIPE_WEBHOOK_SECRET : MISSING

## Ops & Internal (recommended)
- ADMIN_EMAIL : present
- OPERION_INTERNAL_API_KEY : MISSING (required for internal API auth)
- SLACK_WEBHOOK_URL : MISSING
- N8N_WEBHOOK_BASE_URL : MISSING

## Cost tracking (optional with defaults)
- ANTHROPIC_COST_PER_1K_INPUT_TOKENS (default)
- ANTHROPIC_COST_PER_1K_OUTPUT_TOKENS (default)
- APOLLO_COST_PER_ENRICHMENT_CALL (default)
- SENDGRID_COST_PER_EMAIL (default)
- MONTHLY_API_BUDGET_USD (default)

## Notes
- Many integrations are intentionally left blank in `.env.local` for local development. For production, populate each provider key and secure them in Vercel/secret manager.
- A runtime guard `SKIP_SUPABASE_AT_RUNTIME` is supported by `safe-production` wrapper; set to `true` to run without Supabase but note many features will be read-only or disabled.
- Add `SKIP_SUPABASE_DURING_BUILD=true` during CI builds if you need to avoid contacting external DB when generating static pages.

## Runtime-only and local-only flags
- SKIP_SUPABASE_DURING_BUILD=true : local/CI builds to avoid remote DB calls during static generation.
- SKIP_SUPABASE_AT_RUNTIME=true : runtime mode that disables Supabase calls (safe-production proxy returns empty/defaults).

## Next steps
- Populate missing keys in Vercel environment variables before deployment.
- Apply database migrations (migrations up to `0008_production_mca_platform.sql`) to your Supabase production database.
- Create monitoring service credentials (Sentry/Datadog) and wire them into `logger`.
- Verify SendGrid and Stripe webhook endpoints are reachable and secrets exist.
