# Deployment Readiness

## Vercel monorepo setup

Use the root `vercel.json` to deploy the `apps/dashboard` project from the monorepo.

Root configuration:

- `version`: `3`
- `installCommand`: `npm install`
- `buildCommand`: `npm run build`
- `framework`: `nextjs`
- `rootDirectory`: `.`
- `outputDirectory`: `apps/dashboard/.next`

This ensures Vercel installs workspace dependencies from the repository root, then builds the dashboard app from the subfolder, with output produced in `apps/dashboard/.next`.

## Local verification

From the repository root run:

```bash
npm run verify:deployment
```

This script checks:

- `vercel.json` is configured for the dashboard monorepo project
- `apps/dashboard/app/page.tsx` and `app/layout.tsx` exist
- `apps/dashboard/app/api/health/route.ts` exists
- `.env.example` includes required Supabase variables
- `apps/dashboard/.next/server/app-paths-manifest.json` contains `/page` and `/api/health/route`

To verify live endpoints after startup, set `BASE_URL` or `NEXT_PUBLIC_BASE_URL` before running the script.

## Key environment variables

Required for production readiness:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional but important for runtime features:

- `ADMIN_EMAIL`
- `OPERION_INTERNAL_API_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `CRM_WEBHOOK_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SLACK_WEBHOOK_URL`
- `N8N_WEBHOOK_BASE_URL`

## Recommended startup commands

From repo root:

```bash
npm run build
npm run verify:deployment
```

For local dashboard development:

```bash
npm run dev
```
