# Vercel Deployment

## Project Settings

- Framework preset: Next.js
- Root directory: repository root
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `apps/dashboard/.next`

The included `vercel.json` mirrors these settings.

## Environment Variables

Add every key from `.env.example` to Vercel. Production routes will fail closed when required server credentials are missing.

## Supabase Auth Redirects

In Supabase Auth settings, add the production domain as an allowed redirect origin:

```txt
https://your-vercel-domain.vercel.app
https://operioncapital.com
```

## Cloudflare

- Point `operioncapital.com` to Vercel using Cloudflare DNS.
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
