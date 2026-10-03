# P0 environment safety - September 23, 2026

No migrations, deployments, emails, AI calls, imports or production data writes were performed.

## Environment mapping and manual setup

- Production: operion-ai-mvp, qvzmdrghnfjqbezneqqc. Existing Vercel Production database variables remain unchanged.
- Staging: operion-ai-staging, dstqbiccseijydgsvlgj. Its credentials and schema have not been verified. Do not assume empty.
- Local: both .env.local files now select http://127.0.0.1:54321, with production secrets cleared. No local credentials were invented. Docker and Supabase CLI were not on PATH; port 54321 was not listening.
- Vercel Preview: database target still unverified. Existing Preview deployments retain their old environment snapshots; do not use them for tests. No deployment was created to update those snapshots.

Vercel project operion-ai-dashboard: Settings > Environment Variables, select Preview ONLY.
Replace NEXT_PUBLIC_SUPABASE_URL with https://dstqbiccseijydgsvlgj.supabase.co and replace its anon key and service-role key with the matching staging project's keys. Do not reuse production keys. Set SUPABASE_PROJECT_REF=dstqbiccseijydgsvlgj if used; use only staging connection/password values for SUPABASE_DB_URL and SUPABASE_DB_PASSWORD. Never add the service-role key under NEXT_PUBLIC_. Keep Production selections unchanged.

Preview access to the shared SENDGRID_API_KEY, OPENAI_API_KEY and ANTHROPIC_API_KEY was removed, preserving their Production targets and values. Keep SENDGRID, CRM, n8n, Slack, Stripe and Zoho delivery secrets absent in staging. AI remains off unless separate staging keys and OPERION_ALLOW_NONPRODUCTION_AI=true are explicitly approved/configured. Keep both acquisition scheduler flags false.

On September 27, 2026, Preview access was also removed from every OPERION_EMAIL_* sender identity, OPERION_EMAIL_DOMAIN, and SENDGRID_FROM_EMAIL. The Vercel Preview scope now contains only NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY. Their encrypted values were not read, changed, or assumed. Production targets for all removed values remain intact. This is configuration only; no deployment was created, so existing Preview deployments must not be used as staging proof.

Generate distinct staging internal/cron/upload-signing secrets only when needed; never copy production ones. Configure staging Supabase Auth Site URL/redirects for the intended protected Preview hostname, not production. Local Auth redirects must use localhost. Keep storage buckets private; signing must use that environment's Supabase service key. No production users/documents/data may be copied.

Install/start Docker Desktop and install the Supabase CLI. Initialize a local Supabase configuration after review, start the local stack, and privately obtain the actual local anon/service keys and DB URL from `supabase status`. Populate both ignored .env.local files with those local values. No repository migrations are authorized in this task. Keep credentials blank until this is done; protected pages failing closed is expected.

## Security view: proposal only, not in the runnable migration directory

Current owner: postgres. reloptions: NULL (no security_invoker).
Exact current definition:

```sql
SELECT lead_id,
       sum(estimated_cost_usd) AS total_cost
FROM api_usage_log
WHERE lead_id IS NOT NULL
GROUP BY lead_id;
```

Current grants: anon, authenticated and service_role each have SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER without grant option; postgres has those with grant option. The aggregate view is not generally updatable, but SELECT is a real exposure. No runtime use was found beyond generated types; the definition originates in 0001_mvp_v1.sql. RLS on the underlying table does not make an owner-executed view safe.

Proposed controlled SQL, awaiting explicit production approval:

```sql
BEGIN;
ALTER VIEW public.lead_cost_summary SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON TABLE public.lead_cost_summary FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.lead_cost_summary FROM service_role;
GRANT SELECT ON TABLE public.lead_cost_summary TO service_role;
COMMIT;
```

Validate after approval in staging first: anon/authenticated must be denied; the required server-side service role must retain SELECT; unrelated application/document reads must remain unaffected. PostgreSQL owner access is retained. No row deletions or view definition replacement are proposed.

Rollback before commit: ROLLBACK. After commit, prefer a reviewed server-role-only access correction rather than reopening public access. Exact historical rollback (security regression; separate approval required):

```sql
BEGIN;
ALTER VIEW public.lead_cost_summary RESET (security_invoker);
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.lead_cost_summary TO anon, authenticated, service_role;
COMMIT;
```

## Impersonation: awaiting approval, code unchanged

session.ts explicitly describes the header override as E2E automation. It replaces auth.getUser using x-operion-internal-key plus ADMIN_EMAIL and a server service-role Auth request. There is no environment restriction. Callers include components/layout/protected-page.tsx and lib/data/customer-workspace.ts, so protected internal and customer pages can be affected. The WithTestOverride export has no external caller, but the base factory already invokes the override.

Related internal-key authorization paths also exist in lib/auth.ts and middleware.ts. Production has the internal-key variable; the current Vercel inventory does not show ADMIN_EMAIL, so the session override's complete runtime prerequisites are not proven. The credential is server-side, but possession grants elevated capability. It is not a substitute for legitimate founder login and was not exercised during this task.

Restricting/removing this capability changes production behavior and therefore requires approval. Proposed direction: remove test identity impersonation from production entirely; test through real staging Auth sessions. Review separate machine-to-machine API authentication independently. Normal password/cookie login must remain intact.

A separate development-only fallback in requireRole created a synthetic local-founder when Auth configuration was missing. That fallback was removed so blank local credentials fail closed. The production branch already rejected missing Auth configuration, so this does not change normal production password/cookie authentication. The internal-key impersonation paths above remain unchanged pending approval.

## Read-only migration reconciliation

Production ledger has 34 entries through 0033; every recorded SHA-256 matches its repository file. Both 0009 filenames are independently recorded and must not be collapsed by numeric prefix. 0033 evaluation/lesson/strategy tables exist. company_cycles and claim_company_task exist from 0034; claim_company_cycle includes the 0035 completed-cycle cooldown. Thus production schema is ahead of its ledger for these objects; this is not proof every statement of 0034/0035 has been reconciled. No evidence of ledger-ahead drift in the inspected objects. Staging/local schemas remain UNKNOWN (no staging credentials or running local database).

The old ledger utility blindly stamped every file as applied; it is now blocked. A later reviewed reconciliation must verify each migration's objects and grants before adding any missing ledger entry. Do not rerun 0034/0035 blindly. Migration commands reject production unless both --approved-production and OPERION_APPROVED_PRODUCTION_MIGRATION=qvzmdrghnfjqbezneqqc are explicitly supplied after approval. This task does not grant that approval. Dry-run no longer creates a ledger table.

## Pause prevention

Production was reachable during the metadata audit; the warning remains actionable and its exact deadline is unknown. In Supabase, select the organization containing operion-ai-mvp > Billing > upgrade to Pro. Billing is manual and was not changed. Paid plans prevent inactivity pauses. Organization-wide pricing means staging can remain Free only in a separate Free organization, accepting possible pauses. Do not create artificial activity or keepalive jobs. See https://supabase.com/docs/guides/platform/free-project-pausing and https://supabase.com/docs/guides/platform/billing-faq.

## Validation and remaining limits

Typecheck and lint passed. Eight focused suites passed: deployment-environment, environment-safety, migration-guards, auth-fail-closed, acquisition-dry-run, document-access, document-worker, lead-list-view. These use isolated/mocked data, not live production mutations. Syntax checks passed for modified live harnesses. Both local files pass the local-target guard and have blank anon/service keys with both schedulers false.

Build compiled, then failed during page-data collection for /api/ai/workflows/structured because real local Supabase anon/service credentials are absent. No fake credentials or production keys were used to bypass this failure. No working local database or staging runtime is claimed. Older deployed Preview snapshots may still contain previous credentials; prevent their use until reviewed and replaced by an explicitly approved isolated deployment. No deployment occurred here.

Email, CRM/n8n and lender-delivery guards were added in local code; these are not deployed. Nonproduction delivery returns disabled/denied, not a fabricated successful email. Both local and Preview AI defaults are off; opting into staging AI requires its own credentials. Remote E2E scripts are blocked until staging deployment identity is established; local tests are permitted only with a nonproduction database target.

## Exact files changed in this task

Paths below are relative to C:/Users/Asus/Desktop/AMAN/Operion-AI. Pre-existing unrelated dirty/untracked work was preserved.

```text
.env.local
apps/dashboard/.env.local
apps/dashboard/deployment-environment.mjs
apps/dashboard/environment-safety.cjs
apps/dashboard/environment-safety.d.cts
apps/dashboard/lib/env.ts
apps/dashboard/lib/auth.ts
apps/dashboard/lib/runtime/integration-guards.ts
apps/dashboard/lib/notifications.ts
apps/dashboard/lib/email/sendgrid.ts
apps/dashboard/lib/distribution.ts
scripts/apply-migrations.js
scripts/supabase-migrate.js
scripts/reconcile-migration-ledger.mjs
scripts/validate-durable-autonomy.cjs
scripts/run-continuous-acquisition.cjs
scripts/test-durable-policy.cjs
scripts/seed-test-data.js
scripts/verify-google-places-dry-run.cjs
scripts/test-deployment-environment.mjs
scripts/test-environment-safety.cjs
scripts/test-migration-guards.cjs
scripts/test-auth-fail-closed.cjs
scripts/e2e/environment-guard.cjs
scripts/e2e/login-and-admin-check.js
scripts/e2e/login-persistence-check.js
scripts/e2e/debug-supervisor-login.js
scripts/e2e/inspect-supervisor-login.js
scripts/e2e/check-login-route.js
docs/P0_ENVIRONMENT_SAFETY.md
```

Normal ignored build/typecheck caches were generated by validation. No SQL migration file was added or executed. session.ts and its production impersonation behavior were not changed in this task. No commit or push was made.
