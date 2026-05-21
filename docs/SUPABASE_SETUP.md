# Supabase Setup

## 1. Create Project

Create a Supabase project and copy:

- Project URL
- Anon key
- Service role key

Set them in `apps/dashboard/.env.local` for local development and in Vercel for production.

Optionally set `SUPABASE_DB_URL` or `SUPABASE_DB_PASSWORD` in `apps/dashboard/.env.local` to enable `npm run supabase:push` from the repository root.

## 2. Apply Schema

Run the migration in Supabase SQL Editor:

```sql
-- packages/database/migrations/0001_mvp_v1.sql
```

For manager-agent orchestration, also run:

```sql
-- packages/database/migrations/0002_manager_agent_orchestration.sql
```

For the full multi-agent supervisor architecture, run:

```sql
-- packages/database/migrations/0003_multi_agent_architecture.sql
```

This adds operational and department agents, task queue storage, agent-to-agent messages, central memory, shared context, workflow routes, approval requests, performance metrics, and executive reports.

For autonomous lead acquisition and AI SDR outreach, run:

```sql
-- packages/database/migrations/0004_lead_acquisition_outreach.sql
```

This adds lead sources, business contacts, enrichment records, acquisition jobs, outreach campaigns, outreach sequences, email queue storage, reply analytics, and workflow routes for acquisition and SDR execution.

For internal testing, diagnostics, simulation controls, workflow traces, provider registry, and production readiness reports, run:

```sql
-- packages/database/migrations/0005_internal_testing_simulation.sql
```

This migration depends on `0004_lead_acquisition_outreach.sql` because it tags acquisition and outreach records with `is_test_data`.

For the public Operion Capital Phase 1 MVP application flow, run:

```sql
-- packages/database/migrations/0006_phase1_public_mvp.sql
```

This adds public `users`, `businesses`, `applications`, and `ai_qualification_logs` tables for the funding application workflow.

For the polished customer/internal platform separation, notifications, CRM activities, and underwriting review queue, run:

```sql
-- packages/database/migrations/0007_platform_separation_fintech_schema.sql
```

For the production MCA platform records, role-based profiles, business applications, AI task queue, lead scoring, lender matches,
documents, offers, approvals, plural audit logs, and API usage logs, run:

```sql
-- packages/database/migrations/0008_production_mca_platform.sql
```

For Phase 2 AI operations, application lifecycle statuses, AI dispatcher agent aliases, and workflow routes, run:

```sql
-- packages/database/migrations/0009_phase2_ai_operations.sql
```

Alternatively, if `SUPABASE_DB_URL` or `SUPABASE_DB_PASSWORD` is configured, you can apply pending migrations from the repository:

```bash
npm run supabase:push
```

Then run seed data only for the initial active prompt and optional founding lenders:

```sql
-- packages/database/seed.sql
```

## 3. Auth

Create one founder user in Supabase Auth with the same email as `ADMIN_EMAIL`.

Customer signup creates Supabase Auth users and a `profiles` row through the `0008` auth trigger. Internal access is role-based through
`profiles.role` with supported roles:

- `customer`
- `staff`
- `supervisor`
- `founder`

Set founder/operator users to `founder`, `supervisor`, or `staff` in `profiles.role`. `ADMIN_EMAIL` is also treated as founder by the middleware
and API auth layer. Direct table access is denied by default through RLS; the app server uses `SUPABASE_SERVICE_ROLE_KEY` for trusted repository
operations.

## 4. RLS

All MVP tables have RLS enabled and no browser policies. This keeps the database closed unless requests pass through the server-side API route layer.

## 5. Prompt Activation

Use the `activate_prompt_version(target_prompt_version_id, actor)` SQL function or the dashboard API route. The database enforces at most one active prompt with a partial unique index.
