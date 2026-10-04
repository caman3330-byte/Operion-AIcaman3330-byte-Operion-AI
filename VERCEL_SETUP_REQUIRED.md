# VERCEL PRODUCTION SETUP - REQUIRED BEFORE TESTING

## Critical: Set these environment variables in Vercel Production

**Project:** operion-ai-dashboard  
**Environment:** Production only

### Required Variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://operion-ai-mvp.supabase.co` | The production Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | [From Supabase] | Public anon key from operion-ai-mvp project |
| `SUPABASE_SERVICE_ROLE_KEY` | [Your secret key] | The sb_secret_... key you have |

### How to Add in Vercel:

1. Go to: https://vercel.com/projects
2. Select: `operion-ai-dashboard`
3. Go to: **Settings** → **Environment Variables**
4. For each variable:
   - Click **Add New**
   - Enter Variable Name
   - Enter Value
   - Select **Production** checkbox
   - Click **Save**

### Getting Supabase Keys:

From your operion-ai-mvp Supabase project:
- Go to: Supabase Dashboard → Settings → API
- Copy: **Project URL** (should be https://operion-ai-mvp.supabase.co)
- Copy: **Anon Key** (starts with eyJ...)
- Copy: **Service Role Key** (the secret you already have)

### Verification:

After setting variables in Vercel:
1. Vercel will auto-redeploy
2. Run production test: `curl https://operion-ai-dashboard.vercel.app/api/data/diagnostics`
3. Expected response: `{"status":"healthy","database":{"connected":true,"migration_0044_applied":true}...}`

### DO NOT:

❌ Paste secrets into chat or code  
❌ Hardcode secrets in .env files  
❌ Commit secrets to git  
❌ Put secrets in frontend code  

### Security Notes:

- `NEXT_PUBLIC_*` variables are visible to frontend (OK for these)
- `SUPABASE_SERVICE_ROLE_KEY` is secret - server-side only
- Vercel encrypts and doesn't expose values in logs
- Each deployment uses these values securely
