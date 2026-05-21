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
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
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
