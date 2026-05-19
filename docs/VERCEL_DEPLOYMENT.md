# Vercel Deployment

## Project Settings

- Framework preset: Next.js
- Root directory: `apps/dashboard`
- Install command: `cd ../.. && npm install`
- Build command: `cd ../.. && npm run build --workspace @operion/dashboard`
- Output directory: `.next`

The included `vercel.json` mirrors these settings and ensures workspace dependencies are installed from the repo root before building the dashboard app.

## Environment Variables

Add every key from `.env.example` to Vercel. Production routes will fail closed when required server credentials are missing.

## Supabase Auth Redirects

In Supabase Auth settings, add the production domains as allowed redirect origins:

```txt
https://your-vercel-domain.vercel.app
https://operioncapital.com
https://www.operioncapital.com
```

## Cloudflare

- Point `operioncapital.com` and `www.operioncapital.com` to Vercel using Cloudflare DNS.
- Configure `www.operioncapital.com` as the canonical Vercel alias and redirect the root domain to `www`.
- Keep SSL/TLS mode on Full or Full (strict).
- Enable standard DDoS protection and caching for static assets.
- Do not cache authenticated dashboard or API routes.

## Release Checklist

1. Apply Supabase migrations through `0009_phase2_ai_operations.sql`.
2. Seed the initial active prompt.
3. Create the founder user in Supabase Auth.
4. Add Vercel environment variables.
5. Deploy.
6. Confirm `/api/health` reports configured services.
7. Import n8n workflow files and wire credentials.
