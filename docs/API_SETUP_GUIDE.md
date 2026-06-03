# API Setup Guide

## Required For Live Backend

Set these in `apps/dashboard/.env.local` for local development and in Vercel for production:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAIL=
```

Optionally, add a database connection string or password so migrations can be applied from the repository:

```env
SUPABASE_DB_URL=
SUPABASE_DB_PASSWORD=
```

Apply Supabase migrations `0001` through `0009` in order.

## AI Providers

```env
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
ANTHROPIC_MODEL_DEFAULT=claude-3-5-haiku
ANTHROPIC_MODEL_PREMIUM=claude-sonnet-4-6
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_COST_PER_1K_INPUT_TOKENS=0
OPENAI_COST_PER_1K_OUTPUT_TOKENS=0
```

Claude powers underwriting/funding reasoning and executive summaries. OpenAI powers strict structured outputs for extraction, outreach, CRM activities, and schema-bound operational data.

## Apollo

```env
APOLLO_API_KEY=
APOLLO_API_BASE_URL=https://api.apollo.io/api/v1
```

Apollo integration methods live in `apps/dashboard/lib/integrations/apollo.ts`:

- `lookupCompanyInApollo`
- `lookupContactInApollo`
- `enrichLeadWithApollo`
- `syncOutreachToApollo`

## SendGrid Role Mailboxes

```env
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
OPERION_EMAIL_DOMAIN=operioncapital.com
OPERION_EMAIL_FUNDING=funding@operioncapital.com
OPERION_EMAIL_SUPPORT=support@operioncapital.com
OPERION_EMAIL_CONTACT=contact@operioncapital.com
OPERION_EMAIL_LENDERS=lenders@operioncapital.com
OPERION_EMAIL_PARTNERS=partners@operioncapital.com
OPERION_EMAIL_SUBMISSIONS=submissions@operioncapital.com
OPERION_EMAIL_ALERTS=alerts@operioncapital.com
OPERION_EMAIL_SYSTEM=system@operioncapital.com
OPERION_EMAIL_OPERATIONS=operations@operioncapital.com
```

The platform routes merchant outreach and document requests through `funding@`, support through `support@`, lender communications through `lenders@` or `submissions@`, and internal automation through `alerts@` or `system@`.

## Server-To-Server Automation

```env
OPERION_INTERNAL_API_KEY=
N8N_WEBHOOK_BASE_URL=
SLACK_WEBHOOK_URL=
```

Use `x-operion-internal-key` for n8n and backend automation calls.

## Production Verification

After environment and migrations are ready:

1. `npm.cmd run typecheck`
2. `npm.cmd run lint`
3. `npm.cmd run build`
4. `GET /api/health`
5. Submit `/apply`
6. Verify rows in `business_applications`, `leads`, `documents`, `ai_tasks`, `ai_task_logs`, `audit_logs`, and `api_usage_logs`
7. Run `POST /api/ai/tasks/dispatch`
