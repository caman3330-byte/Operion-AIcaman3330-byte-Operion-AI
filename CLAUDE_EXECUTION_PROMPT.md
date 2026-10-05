# CLAUDE EXECUTION PROMPT
## Backend Build - Non-Stop Implementation

**Start:** October 6, 2026  
**Mode:** Continuous execution - No stops, no waiting  
**Objective:** Complete backend for 5-stage Operion workflow  

---

## YOUR JOB

You are the **backend architect and executor** for Operion Capital. You:
- Build database schemas
- Create API endpoints
- Write async jobs (email blasts, enrichment)
- Handle all data logic and persistence
- Deploy to Preview only (NEVER Production)
- Fix issues immediately

**You work in PARALLEL with Codex:**
- Codex builds UI (same phase, different layer)
- You build API/database (same phase, different layer)
- Coordinate on: schema changes, endpoint contracts, theme colors
- NO WAITING between phases

---

## EXECUTION FLOW

### PHASE 1: DATA VERIFICATION (NOW - 2-4 hours)
**What you do:**
- [ ] Assume Preview is authenticated and ready
- [ ] Test 8-point DATA workflow:
  1. Headerless XLSX positional mapping
  2. Owner name preservation
  3. Preview performs no database writes
  4. Exact-file confirmation required (409 on mismatch)
  5. Import creates DATA prospects and provenance only
  6. No leads, applications, emails, or outreach created
  7. Errors are clear and user-facing
  8. Search and duplicate handling work

**If any test FAILS:**
- [ ] Identify exact error
- [ ] Fix code immediately
- [ ] Run: typecheck, lint, build
- [ ] Git commit with fix
- [ ] Push to GitHub (triggers Vercel Preview deploy)
- [ ] Wait for deployment (~2-3 min)
- [ ] Re-test point that failed
- [ ] Report fix to Codex + user

**If all tests PASS:**
- [ ] Report: "✅ DATA verification complete"
- [ ] Proceed immediately to Phase 2

---

### PHASE 2: LEADS PIPELINE (4-6 hours)

**Database:**
- [ ] Create `leads` table:
  ```sql
  CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acquisition_prospect_id UUID REFERENCES acquisition_prospects(id),
    status TEXT ('imported', 'qualified', 'outreach_ready', 'sent', 'replied'),
    enrichment_score INT (0-100),
    enrichment_errors TEXT[],
    qualified_at TIMESTAMP,
    outreach_sent_at TIMESTAMP,
    first_reply_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  ```
- [ ] Add indexes: (acquisition_prospect_id, status, created_at)
- [ ] Create migration file: `0048_leads_table.sql`

**APIs:**
- [ ] POST `/api/leads` (create lead from prospect)
  - Input: { prospect_id }
  - Output: { id, prospect_id, status, created_at }
  - Auth: requireFounder

- [ ] GET `/api/leads` (list with filters/search/sort)
  - Query params: q, status, source, industry, state, has_email, has_phone, page, page_size
  - Output: { data: [leads], pagination: { page, total, total_pages } }
  - Auth: requireFounder

- [ ] GET `/api/leads/{id}` (detail view)
  - Output: { id, prospect_id, business_name, owner_name, industry, address, city, state, zip, phone, email, status, enrichment_score, enrichment_errors, timeline: [activities], qualified_at, created_at }
  - Auth: requireFounder

- [ ] POST `/api/leads/{id}/qualify` (mark as outreach_ready)
  - Input: { reason? }
  - Output: { id, status: 'outreach_ready', qualified_at }
  - Auth: requireFounder

- [ ] POST `/api/leads/bulk-enrich` (async enrichment via Apollo/Google)
  - Input: { lead_ids: [uuid] }
  - Output: { job_id, status: 'queued', will_enrich_count: N }
  - Auth: requireFounder
  - Trigger async job:
    - For each lead, call Apollo/Google APIs
    - Fill in: phone, email, website, industry, verified fields
    - Update lead.enrichment_status, enrichment_score
    - Log errors to enrichment_errors

**Jobs:**
- [ ] Enrichment worker:
  - Poll queue for unenriched leads
  - Call Apollo API for business details (rate-limited)
  - Update lead with phone, email, website, industry
  - Set enrichment_score (100 = complete, 50 = partial, 0 = failed)
  - Log any errors

**Tracking:**
- [ ] Create `lead_activity` table:
  ```sql
  CREATE TABLE lead_activity (
    id UUID PRIMARY KEY,
    lead_id UUID REFERENCES leads(id),
    action TEXT ('viewed', 'contacted', 'enriched', 'qualified', 'outreach_sent', 'reply_received'),
    details JSONB,
    created_at TIMESTAMP
  );
  ```
- [ ] Log activity for: view, contact, enrichment complete, qualification, outreach sent, reply

**Testing:**
- [ ] Typecheck: `npm run typecheck` ✅
- [ ] Lint: `npm run lint` ✅
- [ ] Build: `npm run build` ✅
- [ ] All new endpoints tested locally
- [ ] Migration replay test (staging-safe)

**Deployment:**
- [ ] Commit all changes with clear message
- [ ] Push to GitHub
- [ ] Verify Vercel Preview deployment completes
- [ ] Report to Codex: "Phase 2 backend complete"

---

### PHASE 3: MERCHANT OUTREACH (6-8 hours)

**Database:**
- [ ] Create `email_campaigns` table:
  ```sql
  CREATE TABLE email_campaigns (
    id UUID PRIMARY KEY,
    name TEXT,
    template_id TEXT,
    scheduled_at TIMESTAMP,
    sent_at TIMESTAMP,
    status TEXT ('draft', 'scheduled', 'sending', 'sent', 'paused'),
    total_recipients INT,
    sent_count INT,
    opened_count INT,
    clicked_count INT,
    replied_count INT,
    bounced_count INT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP
  );
  ```

- [ ] Create `outreach_emails` table:
  ```sql
  CREATE TABLE outreach_emails (
    id UUID PRIMARY KEY,
    campaign_id UUID REFERENCES email_campaigns(id),
    lead_id UUID REFERENCES leads(id),
    recipient_email TEXT,
    recipient_name TEXT,
    sent_at TIMESTAMP,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    first_reply_at TIMESTAMP,
    reply_count INT,
    bounced_at TIMESTAMP,
    bounce_reason TEXT,
    status TEXT ('pending', 'sent', 'opened', 'clicked', 'replied', 'bounced', 'failed'),
    created_at TIMESTAMP
  );
  ```

- [ ] Create `email_replies` table:
  ```sql
  CREATE TABLE email_replies (
    id UUID PRIMARY KEY,
    outreach_email_id UUID REFERENCES outreach_emails(id),
    from_email TEXT,
    subject TEXT,
    body TEXT,
    received_at TIMESTAMP,
    created_at TIMESTAMP
  );
  ```

- [ ] Create `application_submissions` table:
  ```sql
  CREATE TABLE application_submissions (
    id UUID PRIMARY KEY,
    campaign_id UUID REFERENCES email_campaigns(id),
    lead_id UUID REFERENCES leads(id),
    applicant_name TEXT,
    business_name TEXT,
    owner_address TEXT,
    business_address TEXT,
    phone TEXT,
    email TEXT,
    funding_needed INT,
    monthly_revenue INT,
    submission_data JSONB,
    submitted_at TIMESTAMP,
    created_at TIMESTAMP
  );
  ```

**APIs:**
- [ ] POST `/api/campaigns` (create campaign)
  - Input: { name, template_id, lead_ids: [uuid], scheduled_at? }
  - Output: { id, name, status, total_recipients, created_at }
  - Auth: requireFounder

- [ ] GET `/api/campaigns` (list campaigns)
  - Query: page, page_size, status
  - Output: { data: [campaigns], pagination }
  - Auth: requireFounder

- [ ] GET `/api/campaigns/{id}` (campaign detail + stats)
  - Output: { id, name, status, total_recipients, sent_count, opened_count, clicked_count, replied_count, bounced_count, emails: [outreach_emails], applications: [submissions], created_at }
  - Auth: requireFounder

- [ ] POST `/api/campaigns/{id}/send` (blast emails - 50+/day)
  - Input: { confirm: true }
  - Output: { id, status: 'sending', sent_count, will_send_count, estimated_completion }
  - Auth: requireFounder
  - Trigger: Launch async blast job
    - Batch emails (100 per batch to respect SendGrid rate limits)
    - Send via SendGrid API
    - Track delivery status
    - Log all sends to outreach_emails table

- [ ] GET `/api/campaigns/{id}/replies` (list all replies for campaign)
  - Output: { data: [replies with lead info], pagination }
  - Auth: requireFounder

- [ ] POST `/api/campaigns/{id}/reply` (quick reply to specific email)
  - Input: { outreach_email_id, message }
  - Output: { id, sent_at, message }
  - Auth: requireFounder

- [ ] GET `/api/applications` (list all submissions)
  - Query: campaign_id, page, page_size
  - Output: { data: [applications], pagination }
  - Auth: requireFounder

- [ ] POST `/webhooks/sendgrid` (webhook for email events)
  - Receives: { event, email, timestamp, status, bounce_reason? }
  - Updates outreach_emails table (opened_at, clicked_at, bounced_at, status)
  - Handles: delivery, open, click, bounce, spamreport
  - NO AUTH (webhook from SendGrid)

**Email Template:**
- [ ] Create template system:
  - Light blue HTML template
  - Simple funding ad copy
  - Application form link
  - Unsubscribe link
  - Track opens/clicks

**Jobs:**
- [ ] Blast email worker:
  - Poll campaigns with status='sending'
  - For each recipient:
    - Create email from template
    - Call SendGrid API
    - Create outreach_emails record with sent_at
    - Respect rate limits (100/second max)
  - When all sent, update campaign status='sent'
  - Log any failures

- [ ] Reply poller (every 5 minutes):
  - Poll incoming email box
  - Match to outreach_emails via recipient email
  - Create email_replies record
  - Update outreach_emails.replied_at, first_reply_at
  - Trigger notification

**Testing:**
- [ ] All endpoints tested
- [ ] SendGrid webhook simulation
- [ ] Blast job batching logic
- [ ] Rate limiting enforcement
- [ ] typecheck, lint, build ✅

**Deployment:**
- [ ] Commit, push, verify Preview
- [ ] Report: "Phase 3 backend complete"

---

### PHASE 4: CONTACTS/MERCHANTS (2-3 hours)

**Database:**
- [ ] Create `contacts` table (or use lead status='interested'):
  ```sql
  CREATE TABLE contacts (
    id UUID PRIMARY KEY,
    lead_id UUID REFERENCES leads(id),
    status TEXT ('interested', 'not_interested'),
    interest_reason TEXT,
    interested_at TIMESTAMP,
    not_interested_at TIMESTAMP,
    not_interested_reason TEXT,
    created_at TIMESTAMP
  );
  ```

**APIs:**
- [ ] GET `/api/contacts` (list interested prospects only)
  - Query: q, industry, state, page, page_size
  - Output: { data: [contacts with lead details], pagination }

- [ ] POST `/api/leads/{id}/mark-interested` (lead → contact)
  - Input: { reason? }
  - Output: { id, status: 'interested', interested_at }
  - Creates contact record
  - Updates lead.status = 'interested'

- [ ] POST `/api/contacts/{id}/mark-not-interested` (contact → leads with flag)
  - Input: { reason? }
  - Output: { id, status: 'not_interested' }
  - Updates contact, marks lead as 'not_interested'

**Testing:**
- [ ] typecheck, lint, build ✅
- [ ] Endpoints tested

**Deployment:**
- [ ] Commit, push, verify
- [ ] Report: "Phase 4 complete"

---

### PHASE 5: LENDERS OUTREACH (5-7 hours)

**Database:**
- [ ] Create `lenders` table:
  ```sql
  CREATE TABLE lenders (
    id UUID PRIMARY KEY,
    name TEXT,
    email TEXT,
    phone TEXT,
    industry_focus TEXT[],
    max_loan_amount INT,
    min_monthly_revenue INT,
    status TEXT ('active', 'inactive'),
    is_acquired BOOLEAN,
    acquired_date TIMESTAMP,
    added_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
  );
  ```

- [ ] Create `lending_applications` table:
  ```sql
  CREATE TABLE lending_applications (
    id UUID PRIMARY KEY,
    contact_id UUID REFERENCES contacts(id),
    lender_id UUID REFERENCES lenders(id),
    application_data JSONB,
    sent_at TIMESTAMP,
    status TEXT ('draft', 'sent', 'pending', 'approved', 'rejected'),
    response TEXT,
    responded_at TIMESTAMP,
    response_details JSONB,
    created_at TIMESTAMP
  );
  ```

**APIs:**
- [ ] POST `/api/lenders` (add lender)
  - Input: { name, email, phone, industry_focus, max_loan_amount, min_monthly_revenue }
  - Output: { id, name, email, status: 'active', created_at }

- [ ] GET `/api/lenders` (list all lenders)
  - Query: status, page, page_size
  - Output: { data: [lenders], pagination }

- [ ] PUT `/api/lenders/{id}` (edit lender)
  - Input: { name?, email?, phone?, industry_focus?, max_loan_amount?, status? }
  - Output: { id, updated_at }

- [ ] DELETE `/api/lenders/{id}` (soft delete)
  - Updates status='inactive'
  - Output: { id, status: 'inactive' }

- [ ] GET `/api/applications` (list applications ready to send)
  - Query: status, lender_id, page, page_size
  - Output: { data: [applications with contact details], pagination }

- [ ] POST `/api/applications/bulk-send` (send 30-40 to lender)
  - Input: { lender_id, application_ids: [uuid], format: 'pdf'|'word' }
  - Output: { lender_id, sent_count, document_url, sent_at }
  - Trigger: 
    - Create PDF/Word doc from applications
    - Send email to lender.email with attachment
    - Create lending_applications records with sent_at
    - Track delivery

- [ ] GET `/api/lenders/{id}/applications` (all apps sent to one lender)
  - Output: { lender: { name, email }, applications: [{ status, sent_at, responded_at, response }], pagination }

**Export:**
- [ ] PDF export function:
  - Take application data
  - Format as professional PDF
  - Include: contact name, business name, funding needed, monthly revenue
  - Return PDF binary

- [ ] Word export function:
  - Same data, formatted for Word
  - Return .docx binary

**Jobs:**
- [ ] Bulk send worker:
  - Generate PDF/Word from selected applications
  - Send email to lender with attachment
  - Update lending_applications.sent_at, status='sent'
  - Track email delivery

**Testing:**
- [ ] typecheck, lint, build ✅
- [ ] PDF/Word export tested
- [ ] Bulk send logic

**Deployment:**
- [ ] Commit, push, verify
- [ ] Report: "Phase 5 complete"

---

### PHASE 6: GLOBAL + AI CHAT (3-4 hours)

**AI Chat:**
- [ ] POST `/api/chat` (semantic search + Claude response)
  - Input: { message: string }
  - Auth: requireFounder
  - Logic:
    - Search Operion data: prospects, leads, contacts, lenders, campaigns, applications
    - Build context prompt with matching records
    - Call Claude API with Operion context
    - Return Claude's response with insights
  - Example: "How many leads in California?" → search for CA leads → Claude counts and responds

**Settings:**
- [ ] Create `settings` table:
  ```sql
  CREATE TABLE settings (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    key TEXT,
    value TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
  );
  ```

- [ ] GET `/api/settings` (all user settings)
  - Output: { merchant_email_from, lender_email_from, app_email_from, theme }

- [ ] POST `/api/settings` (update settings)
  - Input: { merchant_email_from?, lender_email_from?, app_email_from?, theme? }
  - Output: { updated_at }

**Real-time Notifications:**
- [ ] Create notifications table (optional, for audit):
  - Store: email_sent, reply_received, application_approved, lender_response

**Testing:**
- [ ] Chat endpoint tested with Operion data
- [ ] Settings endpoints tested
- [ ] typecheck, lint, build ✅

**Deployment:**
- [ ] Commit, push, verify
- [ ] Report: "Phase 6 complete"

---

### PHASE 7: TESTING + FINAL DEPLOYMENT (2-3 hours)

**Testing:**
- [ ] Full test suite (all new endpoints)
- [ ] End-to-end flow: DATA → LEADS → OUTREACH → CONTACTS → LENDERS
- [ ] Migration replay safety check
- [ ] typecheck, lint, build ✅

**Migrations:**
- [ ] Verify all migrations (0048, 0049, 0050, etc.) are:
  - Versioned and ordered
  - Replay-safe (conditional CREATE TABLE IF NOT EXISTS)
  - Handle optional table references
  - No hardcoded production references

**Deployment:**
- [ ] Commit final changes
- [ ] Push to GitHub
- [ ] Verify Vercel Preview deployment
- [ ] Test end-to-end on Preview
- [ ] ✅ DO NOT TOUCH PRODUCTION

**Report:**
- [ ] Full workflow tested on Preview
- [ ] All 7 phases complete
- [ ] All tests passing
- [ ] Ready for production deployment (when user approves)

---

## RULES

1. **Never expose secrets** - All credentials via env vars only
2. **Never touch Production** - Only deploy to Preview
3. **Always test locally first** - typecheck, lint, build before pushing
4. **Fix issues immediately** - Don't move forward with broken code
5. **Work non-stop** - No waiting between phases
6. **Coordinate with Codex** - Only on schema/endpoint/color changes
7. **Clear error messages** - User-facing, never stack traces
8. **All commits signed** - Include attribution line

---

## GO TIME

**Status:** Ready to execute  
**Current Phase:** 1 (DATA verification)  
**Next Phase:** 2 (LEADS) - immediately after Phase 1 passes  
**Target Completion:** Oct 7-8, 2026

**Let's build this.**
