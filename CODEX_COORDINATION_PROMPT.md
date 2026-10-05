# CODEX ↔ CLAUDE COORDINATION PROMPT
## Full-Stack Operion Platform Build: DATA → LEADS → MERCHANT OUTREACH → CONTACTS → LENDERS

**Status:** Active Development  
**Mode:** Non-Stop Execution  
**Start Date:** October 6, 2026  
**Target:** Complete 5-stage workflow with no interruption  

---

## PROJECT OVERVIEW

Build the complete Operion Capital merchant acquisition and lending platform in 5 integrated stages:

```
STAGE 1: DATA RESEARCH (Foundation ✅ started)
  └─ AI sources (Google Places, Apollo, etc.) + Manual upload + AI enrichment
  
STAGE 2: LEADS (Research → qualified records)
  └─ Converted data with full business details ready for outreach
  
STAGE 3: MERCHANT OUTREACH (AI-driven blast emails)
  └─ 50+ emails/day, light blue theme, same-thread replies, application capture
  
STAGE 4: CONTACTS/MERCHANTS (Interest sorting)
  └─ Move interested to contacts, keep not-interested in leads
  
STAGE 5: LENDERS OUTREACH (Partner lending)
  └─ Manual lender mgmt, bulk app send (30-40), light green theme, PDF/Word
```

**Plus:** AI chat assistant (Operion-aware), search/sort on all pages, email routing config.

---

## CLAUDE'S RESPONSIBILITIES

**Primary:** Full-stack backend + database architecture + API layer + deployment

### Stage 1: DATA (ACTIVE NOW)
- ✅ Headerless CSV/XLSX parsing with positional mapping
- ✅ Owner name preservation (column J)
- ✅ Preview without DB writes
- ✅ Exact hash confirmation before import
- ✅ Duplicate detection (identity_key)
- ✅ Complete provenance preservation
- **NEXT:** Test Preview deployment (8-point verification) → fix any runtime errors immediately

### Stage 2: LEADS Pipeline
- [ ] Create `leads` table schema (source: acquisition_prospects, enriched fields)
- [ ] POST `/api/data/{id}/promote` → create lead (lock for founder-only)
- [ ] Lead status workflow (imported → qualified → outreach_ready → sent → replied)
- [ ] Bulk lead enrichment endpoint (call Apollo/Google APIs async)
- [ ] Lead search + filtering UI endpoints
- [ ] Activity tracking (who viewed, when contacted, etc.)

### Stage 3: MERCHANT OUTREACH
- [ ] Email template system (light blue theme, simple funding ad)
- [ ] Application form schema (Name, business_name, owner_address, business_address, phone, email, funding_needed, monthly_revenue)
- [ ] Blast email job (async worker, min 50/day, track delivery)
- [ ] Same-thread reply capture (webhook from SendGrid → store in database)
- [ ] Email tracking (open/click/reply detection)
- [ ] Merchant outreach API endpoints (GET campaigns, POST send, GET replies)

### Stage 4: CONTACTS/MERCHANTS
- [ ] `contacts` or `merchants` table (interested prospects from leads)
- [ ] Lead → Contact migration endpoint (when interested detected)
- [ ] Contact list API with sort/search
- [ ] Interest status tracking (interested_at, not_interested_at, reason)

### Stage 5: LENDERS OUTREACH
- [ ] `lenders` table (manual entry + future AI discovery)
- [ ] `lending_applications` table (track which apps sent to which lenders)
- [ ] Lender API (CRUD lenders, track in session)
- [ ] Bulk application send endpoint (30-40 at once, PDF/Word export)
- [ ] Application routing (which apps → which lenders, track responses)
- [ ] Lender search + filter endpoints

### Plus: Infrastructure
- [ ] AI Chat Assistant backend (access to Operion data, semantic search)
- [ ] Email routing config (`settings` table or env: merchant_email, lender_email, app_email)
- [ ] Comprehensive error handling (clear user-facing messages)
- [ ] Full-stack authentication (founder-only for controls)
- [ ] Database migrations (all new tables, safe replay on staging)
- [ ] Deploy to Preview only (NEVER touch Production)
- [ ] No credential exposure (env vars only, never print/hardcode)

---

## CODEX'S RESPONSIBILITIES

**Primary:** Frontend UI + UX + theme + real-time interactions

### Stage 1: DATA (Support existing)
- ✅ Manual upload component (already built)
- ✅ Preview table display
- ✅ Hash confirmation button
- **NEXT:** Test & validate 8-point workflow on Preview

### Stage 2: LEADS UI
- [ ] Leads list page (`/leads`)
  - Search bar (business name, address, phone, email)
  - Sort (created_at, enrichment_status, score)
  - Filter (status, source, industry, state, phone/email present)
  - Pagination (25 per page)
- [ ] Lead detail view with:
  - Full business info + owner details
  - Enrichment status + errors
  - Activity timeline (viewed, contacted, etc.)
  - "Promote to Lead" button (locked until qualified)
  - "Ready for Outreach" indicator
- [ ] Bulk qualify/filter UI
- [ ] Export leads (CSV)

### Stage 3: MERCHANT OUTREACH UI
- [ ] Campaigns page (`/outreach/campaigns`)
  - Create campaign (select leads, template, schedule)
  - Light blue theme template editor
  - Bulk send button (show count: "Send to 47 leads?")
  - Delivery tracking (in progress, sent, bounced)
- [ ] Campaign detail (open/click/reply rates)
- [ ] Reply inbox (same-thread replies with quick-reply)
- [ ] Application form responses (live tracking of form fills)
- [ ] Real-time stats (50+ sent today?, click rate, etc.)

### Stage 4: CONTACTS UI
- [ ] Contacts list page (`/contacts`)
  - Only shows interested prospects
  - Search + sort + filter
  - "Move back to Leads" option (if decision reversed)
  - Contact method (email/phone icons)
- [ ] Quick contact card (name, business, phone, email, interest_reason)
- [ ] Timeline (when marked interested, notes, last contact)

### Stage 5: LENDERS UI
- [ ] Lenders management page (`/lenders`)
  - List of lenders (manual entry)
  - Add/edit lender form (name, email, industry focus, max loan amt, etc.)
  - Toggle acquired vs AI-discovered (future)
  - Light green theme
- [ ] Applications page (`/applications`)
  - See which applications exist (from contacts)
  - Filter by lender
  - Bulk send to lenders (select 30-40, send as PDF/Word, track sent_at)
  - Monitor response status (pending, approved, rejected)
- [ ] Lender thread view (all apps sent to one lender, replies)

### Plus: Global UI
- [ ] Top nav: data → leads → outreach → contacts → lenders
- [ ] Settings page (email routing config: merchant_email_from, lender_email_from, app_email_from)
- [ ] AI chat sidebar (access Operion data, answer questions, give insights)
- [ ] Search + sort on every page
- [ ] Responsive design (mobile-friendly)
- [ ] Light blue + light green theme toggle per section
- [ ] Real-time notifications (email sent, reply received, application approved)

---

## WORKFLOW EXECUTION PLAN

### Phase 1: Validation (2-4 hours)
1. **CLAUDE:** Verify Preview deployment (8-point DATA test)
   - If fail: fix → test → commit → deploy Preview → report
   - If pass: proceed to Phase 2

2. **CODEX:** Review current UI, plan leads/outreach/contacts/lenders layouts
   - Create wireframes/mockups for each page
   - Confirm light blue + light green themes with user
   - Plan component reusability

### Phase 2: Leads Pipeline (4-6 hours)
1. **CLAUDE:**
   - Create `leads` table (id, acquisition_prospect_id, status, enrichment_score, qualified_at, created_at)
   - Create `/api/leads/list` endpoint (search, sort, filter)
   - Create `/api/data/{id}/promote` (prospect → lead, lock for founder)
   - Add lead enrichment job (async call to Apollo/Google for missing fields)

2. **CODEX:**
   - Build `/leads` page with table (search, sort, filter, pagination)
   - Build lead detail view (timeline, activity, promote button)
   - Add "Qualify" workflow (button → marks ready_for_outreach)

### Phase 3: Merchant Outreach (6-8 hours)
1. **CLAUDE:**
   - Create `email_campaigns` table (id, name, template, scheduled_at, sent_count, status)
   - Create `outreach_emails` table (id, campaign_id, lead_id, recipient_email, sent_at, opened_at, clicked_at, replied_at, reply_text)
   - Create `application_submissions` table (id, lead_id, campaign_id, name, business_name, phone, email, funding_needed, monthly_revenue, submitted_at)
   - Create `/api/outreach/campaigns` endpoints (POST create, GET list, GET detail, POST send)
   - Create SendGrid webhook handler (POST `/api/webhooks/sendgrid` → track opens/clicks/bounces)
   - Create blast email job (batches 50/day, respects rate limits, logs delivery)
   - Template system (light blue HTML email: funding ad + application link)

2. **CODEX:**
   - Build `/outreach/campaigns` page (create, list, detail, send button)
   - Build campaign stats (sent, opened, clicked, replied percentages)
   - Build reply inbox (show same-thread replies, quick-reply UI)
   - Build application response tracker (live form fill updates)
   - Theme: Light blue for all merchant outreach

### Phase 4: Contacts/Merchants (2-3 hours)
1. **CLAUDE:**
   - Create `contacts` table (copy of interested leads, with status="interested")
   - Create `/api/contacts/list` endpoint
   - Create `/api/leads/{id}/mark-interested` endpoint (lead → contact)
   - Create `/api/contacts/{id}/mark-not-interested` endpoint (contact → leads with not_interested flag)

2. **CODEX:**
   - Build `/contacts` page (list of interested only, search, sort, filter)
   - Build contact card (name, business, phone, email, quick actions)
   - Add "Not Interested" → move back to leads

### Phase 5: Lenders Outreach (5-7 hours)
1. **CLAUDE:**
   - Create `lenders` table (id, name, email, industry_focus, max_loan_amt, status, acquired_date, added_by, created_at)
   - Create `lending_applications` table (id, contact_id, lender_id, application_data, sent_at, status, response, responded_at)
   - Create `/api/lenders` endpoints (CRUD lenders)
   - Create `/api/applications/bulk-send` endpoint (send 30-40 apps to lender as PDF/Word)
   - Create PDF/Word export function (application data → formatted document)
   - Track sending (log which apps → which lenders, delivery status)

2. **CODEX:**
   - Build `/lenders` page (manage lenders, add/edit form)
   - Build `/applications` page (list applications, select bulk send, route to lender)
   - Build bulk send modal (select 30-40, confirm, send, show success)
   - Build application thread view (all apps to one lender, responses)
   - Theme: Light green for all lender outreach

### Phase 6: Global Features + AI Chat (3-4 hours)
1. **CLAUDE:**
   - Create AI chat backend (semantic search over Operion data: prospects, leads, contacts, lenders)
   - Chat endpoint `/api/chat` (POST message → get Claude response with Operion context)
   - Settings table/endpoint for email routing (merchant_email_from, lender_email_from, app_email_from)

2. **CODEX:**
   - Build AI chat sidebar (text input, message history, context-aware responses)
   - Build settings page (email routing config, theme toggle, user preferences)
   - Add search bars + sort dropdowns to all list pages
   - Add real-time notifications (toast alerts for emails sent, replies received, etc.)

### Phase 7: Testing + Deployment (2-3 hours)
1. **CLAUDE:**
   - Run full test suite (all new endpoints)
   - TypeCheck, Lint, Build
   - Create migrations for all new tables
   - Deploy to Preview only
   - Verify end-to-end flow (DATA → LEADS → OUTREACH → CONTACTS → LENDERS)

2. **CODEX:**
   - E2E test all UI flows
   - Theme validation (light blue for merchant, light green for lenders)
   - Mobile responsiveness check
   - Confirm with user before final production deploy

---

## CONSTRAINTS & RULES

### Security
- **NEVER** request, print, expose, or hardcode secrets
- **NEVER** touch Production database
- Use only existing Vercel env vars (SUPABASE_SERVICE_ROLE_KEY already configured)
- All credentials via environment variables, never in code
- Founder-only endpoints for sensitive operations (promote, send campaigns, manage lenders)

### Database
- All migrations must be versioned and replay-safe
- Maintain provenance trail (every record knows its source, timestamp, owner)
- Staging must support same migrations as Production
- No hardcoded references to optional tables (check existence first)

### Frontend
- Search + sort on every list page
- Pagination (25 per page default)
- Mobile-responsive design
- Light blue theme for merchant email outreach
- Light green theme for lenders outreach
- Real-time status updates (toast notifications)

### API
- All endpoints require founder authentication (requireFounder)
- Clear error messages (user-facing, not stack traces)
- Rate limiting on blast email job (respect SendGrid limits: 100 emails/second)
- Async jobs for long operations (enrichment, bulk email send)
- Return explicit counts + status messages (e.g., "Sent 47 emails, 3 bounced, 0 failed")

### Communication
- This prompt is the source of truth
- Codex: frontend + UX
- Claude: backend + database + API + deployment
- Both: coordinate on schema changes, endpoint contracts, theme colors
- Non-stop execution: no waiting between phases, overlap when possible

---

## STARTING NOW

**CLAUDE:** ✅ Verify Preview DATA workflow (8-point test), fix any errors, report status
**CODEX:** ⏳ Review current UI structure, plan leads/outreach/contacts/lenders pages

**Both:** Ready to execute Phase 1 → Phase 2 → ... → Phase 7 without stopping until complete.

---

## SUCCESS CRITERIA

- ✅ DATA: Headerless upload, owner name, preview no-write, hash confirmation, duplicates, provenance, clear errors
- ✅ LEADS: List, search, filter, sort, detail, promote button, enrichment status
- ✅ MERCHANT OUTREACH: Campaigns (50+/day), light blue theme, same-thread replies, application capture, tracking
- ✅ CONTACTS: Move interested from leads, list, filter, quick actions
- ✅ LENDERS: Manual lender mgmt, bulk app send (30-40), light green theme, response tracking
- ✅ GLOBAL: Search/sort everywhere, settings, AI chat assistant, real-time notifications
- ✅ DEPLOY: Preview working end-to-end, no Production changes, all tests passing

---

## EXECUTION CLOCK

**Start:** October 6, 2026  
**Phase 1 (Validation):** 2-4 hrs  
**Phase 2 (Leads):** 4-6 hrs  
**Phase 3 (Merchant Outreach):** 6-8 hrs  
**Phase 4 (Contacts):** 2-3 hrs  
**Phase 5 (Lenders):** 5-7 hrs  
**Phase 6 (Global + Chat):** 3-4 hrs  
**Phase 7 (Test + Deploy):** 2-3 hrs  

**Total:** ~24-35 hours non-stop execution  
**Target Completion:** October 7-8, 2026

---

**CODEX: Ready to build. CLAUDE: Ready to build. LET'S GO.**
