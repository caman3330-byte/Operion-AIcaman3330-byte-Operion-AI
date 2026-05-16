# Environment Variables

Use `.env.example` as the source of truth. For local development, place values in `apps/dashboard/.env.local` because the Next.js app runs from that workspace; keep the repo-root `.env.local` in sync only if local tooling needs it. In production, set these values in Vercel and never commit real credentials.

## Supabase

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public anon key used by Supabase Auth clients.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only key used by API routes and repositories. Never expose it to browser code.

## AI

- `ANTHROPIC_API_KEY`: Claude API key for lead qualification, manager planning, and AI SDR email generation.
- `ANTHROPIC_MODEL`: Claude model name. Defaults to `claude-3-5-sonnet-latest`.
- `OPENAI_API_KEY`: OpenAI key for production funding qualification and underwriting summary generation.
- `OPENAI_MODEL`: OpenAI model name for qualification workflows. Defaults to `gpt-4.1-mini`.

## Outreach

- `SENDGRID_API_KEY`: SendGrid API key for outreach queue delivery and founder notification emails.
- `SENDGRID_FROM_EMAIL`: Verified sender used for outreach and ops reports.
- `CRM_WEBHOOK_URL`: Optional CRM sync webhook for application and lead lifecycle events.

## Lead Data

- `APOLLO_API_KEY`: Used by acquisition connectors and n8n workflows for discovery and enrichment.
- `APOLLO_API_BASE_URL`: Apollo API base URL. Defaults to `https://api.apollo.io/api/v1`.

## Billing

- `STRIPE_SECRET_KEY`: Server-side Stripe key.
- `STRIPE_WEBHOOK_SECRET`: Future webhook signature verification key.

## Ops

- `ADMIN_EMAIL`: Founder email. API auth requires Supabase users to match this email.
- `OPERION_INTERNAL_API_KEY`: Server-to-server key for n8n calls. Send it as `x-operion-internal-key`.
- `SLACK_WEBHOOK_URL`: Slack webhook for WARN and CRITICAL alerts.
- `N8N_WEBHOOK_BASE_URL`: Base URL for n8n webhook-triggered workflows.

## Cost Tracking

- `ANTHROPIC_COST_PER_1K_INPUT_TOKENS`
- `ANTHROPIC_COST_PER_1K_OUTPUT_TOKENS`
- `OPENAI_COST_PER_1K_INPUT_TOKENS`
- `OPENAI_COST_PER_1K_OUTPUT_TOKENS`
- `APOLLO_COST_PER_ENRICHMENT_CALL`
- `SENDGRID_COST_PER_EMAIL`
- `MONTHLY_API_BUDGET_USD`
