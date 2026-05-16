# Operion AI MVP v1

Operion AI powers Operion Capital, an AI-native business funding platform for MCA funding, business loans, fast approvals, AI-assisted qualification, and lender matching.

This repository is the official MVP v1 foundation. It is intentionally scoped to the production-ready architecture, database, API, dashboard shell, integration layers, and operational controls needed to launch the first version.

## Monorepo

```txt
apps/dashboard      Next.js 15 App Router website, dashboard, and API routes
packages/shared     Shared TypeScript domain types
packages/database   Supabase/PostgreSQL schema, migrations, and seed data
workflows           n8n workflow placeholders aligned to the frozen architecture
docs                Deployment, Supabase, n8n, and environment setup
```

## Quick Start

```bash
npm install
npm run dev
```

The Next.js app runs from `apps/dashboard`. Public customer routes serve Operion Capital, while internal operator routes are isolated behind `/supervisor`. API routes use the Supabase service role key and fail closed until required environment variables and migrations are configured.

## Production Scope

Built in v1:

- Next.js dashboard foundation
- Supabase-ready schema and repository layer
- Founder-authenticated API route foundation
- Anthropic, SendGrid, Stripe, and distribution service layers
- Operations Command Center
- Lead management foundation
- Prompt version management foundation
- Lead acquisition, enrichment, SDR outreach queue, reply classification, and approval-gated worker foundation
- Internal simulation, diagnostics, workflow tracing, provider registry, and production readiness reporting
- Public Operion Capital homepage, funding application flow, auth UI, and Phase 1 application schema
- Public/customer route separation with customer dashboard, application status, settings, and dedicated internal `/supervisor` access
- Notification, CRM activity, and underwriting review schema readiness
- Protected integration API boundaries for Apollo lookup, OpenAI qualification, email queueing, and CRM sync
- Audit logging, alerts, API usage, and health infrastructure
- Production Supabase Auth with role-ready customer/staff/supervisor/founder access checks
- Production MCA application intake backed by `business_applications`, `ai_tasks`, `lead_scores`, documents, approvals, and plural audit logs
- OpenAI qualification workflow with structured JSON output, retry handling, AI task logs, and API usage cost tracking
- Phase 2 AI provider layer under `apps/dashboard/lib/ai` with OpenAI structured outputs, Claude reasoning workflows, provider routing, AI task dispatch, retry handling, and cost logging
- Apollo enrichment/service abstraction for company lookup, contact lookup, lead enrichment, and outreach sync

Deferred to v2:

- Public marketplace
- Lender self-service portal
- Multi-operator roles
- Advanced AI agents
- Real-time dashboard subscriptions
- Stripe subscriptions or auto-billing

## Scripts

```bash
npm run dev        # Start dashboard locally
npm run build      # Build shared package and dashboard
npm run lint       # Run dashboard linting
npm run typecheck  # Type-check shared package and dashboard
```

## Setup Docs

- [Environment variables](docs/ENV_VARIABLES.md)
- [Supabase setup](docs/SUPABASE_SETUP.md)
- [Vercel deployment](docs/VERCEL_DEPLOYMENT.md)
- [n8n setup](docs/N8N_SETUP.md)
- [AI architecture](docs/AI_ARCHITECTURE.md)
- [API setup guide](docs/API_SETUP_GUIDE.md)
- [Next steps](docs/NEXT_STEPS.md)
