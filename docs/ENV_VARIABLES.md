# Environment Variables

Use `.env.example` as the source of truth. For local development, place values in `apps/dashboard/.env.local` because the Next.js app runs from that workspace; keep the repo-root `.env.local` in sync only if local tooling needs it. In production, set these values in Vercel and never commit real credentials.

## Supabase

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public anon key used by Supabase Auth clients.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only key used by API routes and repositories. Never expose it to browser code.

## AI

- `ANTHROPIC_API_KEY`: Claude API key for lead qualification, manager planning, and AI SDR email generation.
- `ANTHROPIC_MODEL`: Legacy Claude model fallback for compatibility. Defaults to `claude-sonnet-4-6`.
- `ANTHROPIC_MODEL_DEFAULT`: Default Claude model for lightweight discovery, summaries, and draft generation. Defaults to `claude-3-5-haiku`.
- `ANTHROPIC_MODEL_PREMIUM`: Premium Claude model for underwriting summaries, complex lender matching, and founder review generation. Defaults to `claude-sonnet-4-6`.
- `OPENAI_API_KEY`: OpenAI key for production funding qualification and underwriting summary generation.
- `OPENAI_MODEL`: OpenAI model name for qualification workflows. Defaults to `gpt-4.1-mini`.

## Outreach

- `SENDGRID_API_KEY`: SendGrid API key for outreach queue delivery and founder notification emails.
- `SENDGRID_FROM_EMAIL`: Fallback verified sender used when a role mailbox override is not configured.
- `SENDGRID_FROM_NAME`: Display name for the verified sender. Defaults by email purpose when omitted.
- `SENDGRID_WEBHOOK_PUBLIC_KEY`: SendGrid Event Webhook public key. Required in production so `/api/webhooks/sendgrid` can verify signed delivery events.
- `OPERION_EMAIL_DOMAIN`: Role mailbox domain. Defaults to `operioncapital.com`.
- `OPERION_EMAIL_FUNDING`: Merchant outreach, document requests, and application updates. Defaults to `funding@operioncapital.com`.
- `OPERION_EMAIL_SUPPORT`: Merchant support mailbox. Defaults to `support@operioncapital.com`.
- `OPERION_EMAIL_CONTACT`: General merchant contact mailbox. Defaults to `contact@operioncapital.com`.
- `OPERION_EMAIL_LENDERS`: Lender relations mailbox. Defaults to `lenders@operioncapital.com`.
- `OPERION_EMAIL_PARTNERS`: Lender onboarding and partner workflow mailbox. Defaults to `partners@operioncapital.com`.
- `OPERION_EMAIL_SUBMISSIONS`: Lender submission package mailbox. Defaults to `submissions@operioncapital.com`.
- `OPERION_EMAIL_ALERTS`: Internal AI alert mailbox. Defaults to `alerts@operioncapital.com`.
- `OPERION_EMAIL_SYSTEM`: Operational summary mailbox. Defaults to `system@operioncapital.com`.
- `OPERION_EMAIL_OPERATIONS`: Internal operations notification mailbox. Defaults to `operations@operioncapital.com`.
- `CRM_WEBHOOK_URL`: Optional CRM sync webhook for application and lead lifecycle events.

## Lead Data

- `APOLLO_API_KEY`: Used by acquisition connectors and n8n workflows for discovery and enrichment.
- `APOLLO_API_BASE_URL`: Apollo API base URL. Defaults to `https://api.apollo.io/api/v1`.
- `GOOGLE_PLACES_API_KEY`: Optional Google Places key for merchant discovery adapters when enabled.
- `GOOGLE_CLOUD_PROJECT_ID`: Optional project identifier for Google API operations/readiness tracking.
- `ACQUISITION_SCHEDULER_ENABLED`: Set to `true` only after founder approval to allow Vercel cron source scans.
- `MERCHANT_INTELLIGENCE_SCHEDULER_ENABLED`: Set to `true` only after founder approval to allow Vercel cron source discovery.
- `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_ZONE_ID`: Optional DNS readiness metadata. No Cloudflare automation runs without explicit future code.
- `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET`: Optional Zoho CRM readiness metadata. Zoho is not active unless a dedicated integration is implemented.

## Billing

- `STRIPE_SECRET_KEY`: Server-side Stripe key.
- `STRIPE_WEBHOOK_SECRET`: Future webhook signature verification key.

## Ops

- `ADMIN_EMAIL`: Founder email. API auth requires Supabase users to match this email.
- `CRON_SECRET`: Optional bearer secret accepted by scheduler endpoints for Vercel cron requests.
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

## SendGrid Production Checklist

- [ ] Create a restricted SendGrid API key with Mail Send permission.
- [ ] Add `SENDGRID_API_KEY` to Vercel production environment variables.
- [ ] Add the verified sender address as `SENDGRID_FROM_EMAIL`.
- [ ] Add `SENDGRID_FROM_NAME` if the default display name should be overridden.
- [ ] Configure the SendGrid Event Webhook URL to `https://www.operioncapital.com/api/webhooks/sendgrid`.
- [ ] Enable signed Event Webhook verification in SendGrid.
- [ ] Copy the SendGrid Event Webhook public key into `SENDGRID_WEBHOOK_PUBLIC_KEY`.
- [ ] Enable delivery, open, click, deferred, bounce, dropped, and spam report events.
- [ ] Send one controlled outbound test email from the internal testing page.
- [ ] Confirm SendGrid acceptance, webhook audit entries, email queue state, Command Center lifecycle metrics, and Founder Operations email KPIs.
