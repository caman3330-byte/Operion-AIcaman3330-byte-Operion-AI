# Deployment Checklist (Vercel + Supabase)

## Pre-deploy
- [ ] Ensure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel.
- [ ] Add `ANTHROPIC_API_KEY` and optional `OPENAI_API_KEY`.
- [ ] Add `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`, and `SENDGRID_WEBHOOK_PUBLIC_KEY` for email workflows.
- [ ] Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for payments.
- [ ] Add `OPERION_INTERNAL_API_KEY` for internal API auth.
- [ ] Add `SLACK_WEBHOOK_URL`, `N8N_WEBHOOK_BASE_URL`, `APOLLO_API_KEY` as needed.
- [ ] Enable environment variable `SKIP_SUPABASE_DURING_BUILD=true` only for ephemeral CI builds; prefer building with DB access in production CI if safe.

## Database
- [ ] Run migrations up to `0008_production_mca_platform.sql` on Supabase production.
- [ ] Verify `auth`, `profiles`, `leads`, `business_applications`, `lead_scores`, `lender_matches`, and related tables exist.
- [ ] Seed any necessary lookup data (lenders, products, etc.).

## Vercel
- [ ] Ensure project linked to correct Git repo and branch.
- [ ] Add build command: `npm --workspace=@operion/dashboard run build` or run inside `apps/dashboard`.
- [ ] Set Node version >=16 (Node 24 recommended) and install caches.
- [ ] Configure `vercel.json` if using Edge Functions or output settings.

## Webhooks & Integrations
- [ ] Configure SendGrid Event Webhook for `/api/webhooks/sendgrid`, enable signed verification, and subscribe to delivered/open/click/deferred/bounce/dropped/spam report events.
- [ ] Configure Stripe webhook endpoint and secret.
- [ ] Configure Apollo/io API key for enrichment.
- [ ] Configure Anthropic/OpenAI endpoints and keys.

## Post-deploy smoke tests
- [ ] Visit `/api/health` or equivalent diagnostics endpoint.
- [ ] Run a simple AI task in a sandbox (create AiTask with `task_type: lead_qualification`) and observe logs and ApiUsage entries.
- [ ] Trigger a document upload flow to verify storage and webhook processing.

## Monitoring & Alerts
- [ ] Wire Sentry/Datadog for runtime errors and performance.
- [ ] Configure alerting for failed AI tasks, repeated retries, or integration failures.

## Known blockers (from current audit)
- Missing provider secrets (SendGrid, Stripe, OpenAI) will disable features.
- Runtime Supabase availability is required; `safe-production` enables running without but limits functionality.
- Ensure migrations are applied before running critical flows.

## Final deployment command (example)
- Build locally (optional):

```powershell
cd apps/dashboard
$env:SKIP_SUPABASE_DURING_BUILD='true'
npm run build
```

- Start production server locally (after providing required envs):

```powershell
npm --workspace=@operion/dashboard run start
```

