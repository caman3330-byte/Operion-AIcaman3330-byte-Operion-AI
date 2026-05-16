# Operion AI — MVP v1 Frozen Architecture

> **Status:** Frozen — all future development decisions align with this document unless explicitly updated.
> **Company:** Operion AI — AI-operated digital finance infrastructure
> **Goal:** MCA/business funding lead generation, qualification, automated outreach, lender distribution
> **Launch target:** Week 4 | **Revenue model:** Pay-per-lead | **AI agents (v1):** 2 core agents

---

## Table of Contents

1. [Core Stack](#1-core-stack)
2. [Lead Pipeline](#2-lead-pipeline)
3. [Database Schema — 11 Tables](#3-database-schema--11-tables)
4. [AI Agent Architecture](#4-ai-agent-architecture)
5. [Audit Logging System](#5-audit-logging-system)
6. [System Alerts Infrastructure](#6-system-alerts-infrastructure)
7. [Prompt Versioning System](#7-prompt-versioning-system)
8. [Manual Override Layer](#8-manual-override-layer)
9. [Suppression & Deduplication](#9-suppression--deduplication)
10. [API Usage & Cost Tracking](#10-api-usage--cost-tracking)
11. [Distribution Safety — Founder Approval Flow](#11-distribution-safety--founder-approval-flow)
12. [Operations Command Center](#12-operations-command-center)
13. [Production Hardening](#13-production-hardening)
14. [Revenue Model & Pricing](#14-revenue-model--pricing)
15. [Daily Automated Workflow](#15-daily-automated-workflow)
16. [API Routes — 14 Total](#16-api-routes--14-total)
17. [n8n Workflows — 9 Total](#17-n8n-workflows--9-total)
18. [Folder Structure](#18-folder-structure)
19. [Environment Variables](#19-environment-variables)
20. [4-Week Build Plan](#20-4-week-build-plan)
21. [Features Deferred to v2](#21-features-deferred-to-v2)

---

## 1. Core Stack

| Layer | Technology |
|-------|-----------|
| Frontend + API routes | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Database + Auth | Supabase (PostgreSQL, RLS, Edge Functions, Auth) |
| Workflow orchestration | n8n Cloud |
| Lead discovery + enrichment | Apollo API |
| AI qualification | Anthropic Claude API (claude-sonnet) |
| Email outreach | SendGrid |
| Invoicing | Stripe (manual invoice generation in v1) |
| Deployment | Vercel (Next.js), Railway (future: n8n self-hosted, Puppeteer) |
| Alerts | Slack webhook + SendGrid email to ADMIN_EMAIL |
| Monitoring | n8n execution history + Supabase logs + custom alerts table |

---

## 2. Lead Pipeline

Six automated stages. Zero human touch required for steps 1–4.

```
Discover → Enrich → [Dedup Gate] → Score → Qualify → Outreach → [Approval Gate] → Distribute
```

| Step | Action | Tool | Output |
|------|--------|------|--------|
| 1. Discover | Apollo API query (industry/revenue/age filters) every 6h | n8n cron | Raw leads in `leads` table |
| 2. Enrich | Apollo people endpoint — email, phone, LinkedIn, revenue est. | n8n workflow | `status = 'enriched'` |
| Dedup gate | 4-check deduplication before enrichment spend | Supabase Edge Fn | Skip or continue |
| 3. Score | Claude API per lead → `{score, tier, reason}` JSON | n8n + Anthropic | `qualification_score`, `tier` written |
| 4. Qualify | score ≥ 65 → qualified; C → nurture; D → archived | n8n logic | `status = 'qualified'` or filtered |
| 5. Outreach | SendGrid 3-email sequence (day 0 / 48h / 96h) | n8n + SendGrid | `outreach_history` records |
| Approval gate | Founder reviews and approves via dashboard | Manual | `distribution_approved_at` set |
| 6. Distribute | Webhook POST to matched lenders | n8n + webhooks | `lead_distributions` record |

**Scoring weights:**
- Monthly revenue: 30%
- Time in business: 25%
- Industry risk: 20%
- Contact completeness: 15%
- Location: 10%

**Tier thresholds:** A = 80–100 | B = 65–79 | C = 50–64 | D = below 50

---

## 3. Database Schema — 11 Tables

### `leads`
```sql
id                      uuid PRIMARY KEY
business_name           text NOT NULL
contact_name            text
email                   text
phone                   text
industry                text
state                   text
annual_revenue_est      numeric
time_in_business_years  numeric
apollo_id               text UNIQUE
qualification_score     int
tier                    text CHECK (tier IN ('A','B','C','D'))
status                  text CHECK (status IN (
                          'raw','enriched','scored','qualified',
                          'nurture','archived','distributed',
                          'pending_approval','rejected_distribution',
                          'blacklisted','qualification_error'))
outreach_started        boolean DEFAULT false
outreach_paused         boolean DEFAULT false
blacklisted             boolean DEFAULT false
distribution_approved_at timestamptz
processing_error        boolean DEFAULT false
processing_error_detail text
distributed_at          timestamptz
created_at              timestamptz DEFAULT now()
updated_at              timestamptz DEFAULT now()
```

### `outreach_history`
```sql
id              uuid PRIMARY KEY
lead_id         uuid REFERENCES leads(id)
email_number    int CHECK (email_number IN (1,2,3))
sent_at         timestamptz
opened          boolean DEFAULT false
replied         boolean DEFAULT false
reply_snippet   text
created_at      timestamptz DEFAULT now()
```

### `lenders`
```sql
id                    uuid PRIMARY KEY
company_name          text NOT NULL
contact_email         text
webhook_url           text
criteria_industries   text[]
criteria_min_revenue  numeric
criteria_max_revenue  numeric
price_per_lead        numeric
active                boolean DEFAULT true
whitelisted           boolean DEFAULT false
created_at            timestamptz DEFAULT now()
```

### `lead_distributions`
```sql
id               uuid PRIMARY KEY
lead_id          uuid REFERENCES leads(id)
lender_id        uuid REFERENCES lenders(id)
distributed_at   timestamptz
delivery_status  text CHECK (status IN ('pending','delivered','failed'))
price            numeric
retry_count      int DEFAULT 0
last_retry_at    timestamptz
created_at       timestamptz DEFAULT now()
```

### `invoices`
```sql
id                uuid PRIMARY KEY
lender_id         uuid REFERENCES lenders(id)
period_start      date
period_end        date
lead_count        int
total_amount      numeric
stripe_invoice_id text
status            text CHECK (status IN ('draft','sent','paid'))
created_at        timestamptz DEFAULT now()
```

### `audit_log` *(append-only — never updated or deleted)*
```sql
id           uuid PRIMARY KEY
event_type   text NOT NULL  -- see event types below
actor_type   text CHECK (actor_type IN ('system','founder','n8n_workflow'))
actor_id     text           -- workflow name or admin email
entity_type  text CHECK (entity_type IN ('lead','lender','distribution','prompt','outreach'))
entity_id    uuid
before_state jsonb
after_state  jsonb
metadata     jsonb
ip_address   text
created_at   timestamptz DEFAULT now()
```

**Event type values:** `lead_scored`, `lead_tier_assigned`, `lead_status_changed`, `lead_blacklisted`, `lead_archived`, `lead_outreach_paused`, `score_override`, `distribution_approved`, `distribution_rejected`, `distribution_delivered`, `distribution_failed`, `lender_whitelisted`, `lender_deactivated`, `prompt_version_activated`, `outreach_sent`, `admin_login`, `manual_action`

### `prompt_versions`
```sql
id                    uuid PRIMARY KEY
version_number        int UNIQUE NOT NULL  -- auto-increment
label                 text                 -- e.g. "v1.1-tighter-industry-filter"
system_prompt         text NOT NULL
user_prompt_template  text NOT NULL
scoring_weights       jsonb                -- {revenue, time_in_biz, industry, contact, location}
active                boolean DEFAULT false  -- exactly ONE row is true at any time
created_at            timestamptz DEFAULT now()
created_by            text
notes                 text
```

### `prompt_test_results`
```sql
id                  uuid PRIMARY KEY
prompt_version_id   uuid REFERENCES prompt_versions(id)
lead_id             uuid REFERENCES leads(id)
score_produced      int
tier_produced       text
reason_produced     text
latency_ms          int
created_at          timestamptz DEFAULT now()
```

### `alerts`
```sql
id          uuid PRIMARY KEY
severity    text CHECK (severity IN ('INFO','WARN','CRITICAL'))
alert_type  text NOT NULL
message     text NOT NULL
context     jsonb
resolved    boolean DEFAULT false
resolved_at timestamptz
created_at  timestamptz DEFAULT now()
deleted_at  timestamptz  -- soft delete after 30 days
```

### `api_usage_log`
```sql
id                  uuid PRIMARY KEY
service             text CHECK (service IN ('anthropic','apollo','sendgrid','stripe'))
operation           text        -- e.g. 'qualify_lead', 'enrich_contact', 'send_email'
lead_id             uuid        -- nullable
input_tokens        int
output_tokens       int
estimated_cost_usd  decimal(10,6)
success             boolean
latency_ms          int
created_at          timestamptz DEFAULT now()
```

### `suppression_list`
```sql
id          uuid PRIMARY KEY
type        text CHECK (type IN ('email','domain','business_name','apollo_id','phone'))
value       text NOT NULL
reason      text
added_by    text CHECK (added_by IN ('system','founder'))
created_at  timestamptz DEFAULT now()
```

**Supabase view:**
```sql
CREATE VIEW lead_cost_summary AS
  SELECT lead_id, SUM(estimated_cost_usd) AS total_cost
  FROM api_usage_log
  GROUP BY lead_id;
```

---

## 4. AI Agent Architecture

### Agents built in v1

**Qualification Agent**
- Model: Claude API (claude-sonnet)
- Trigger: n8n workflow reads `status = 'enriched'` leads
- Input: structured lead data (business name, industry, revenue, time in business, contact info, location)
- Output: `{ score: number, tier: "A"|"B"|"C"|"D", reason: string }` (strict JSON, no markdown)
- Logic: `lib/anthropic.ts` — `qualifyLead(lead: Lead): Promise<QualificationResult>`
- Writes to: `leads.qualification_score`, `leads.tier`, `audit_log`, `api_usage_log`
- Prompt tracked in: `prompt_versions` table (active version used at call time)

**Reporting Agent** *(minimal — not AI-narrative)*
- Trigger: n8n cron at 7:00 AM daily
- Action: Queries Supabase for yesterday's metrics, populates a SendGrid template, sends to `ADMIN_EMAIL`
- Contents: leads discovered, qualified, distributed, outreach sent/opened/replied, estimated revenue, API cost yesterday, cost-per-lead

### Agents deferred to v2
- Outreach Personalization Agent (Claude-written custom email copy per lead)
- Conversation Agent (inbound reply handling, intent classification)
- Support Agent (helpdesk chatbot)
- Analytics Agent (trend insights, cohort analysis)
- Executive Reporting Agent (narrative intelligence briefings)

---

## 5. Audit Logging System

Every meaningful system event writes to `audit_log` **before** the action executes. If the action fails, the log entry is updated with `metadata.error`. The log is append-only — no updates, no deletes.

**Logging strategy:**
- n8n workflows: write to `audit_log` via Supabase HTTP node as first step in any state-change workflow
- API routes: `audit_log` write is the first database operation; if it fails, the route returns 500 before any state change
- Admin actions: every manual override goes through `PATCH /api/leads/[id]/override`, which logs first then executes

**Dashboard:** "Audit Trail" tab in Operations Command Center. Last 500 events, filterable by event type / entity type / date range / actor. Row-expandable to show `before_state` / `after_state` diff. CSV export.

---

## 6. System Alerts Infrastructure

**Health monitor:** n8n workflow `07_health_monitor.json` runs every 15 minutes.

### Alert thresholds

| Condition | WARN | CRITICAL |
|-----------|------|----------|
| Apollo API failures | Error rate >20% in batch | 3+ consecutive failures |
| Anthropic API failures | Latency >8s per call | 0 successful qualifications in a batch |
| SendGrid bounce rate | >15% | >30% |
| Webhook delivery | Any single lender fails | All lenders fail in a run |
| Lead discovery | — | 0 leads in 2 consecutive runs |
| Qualification rate | <10% of enriched leads qualified in a day | — |
| Workflow execution | — | Any workflow fails and does not self-recover after 1 retry |
| API budget | 70% of MONTHLY_API_BUDGET_USD | 90% of MONTHLY_API_BUDGET_USD |
| Cost per lead | — | Exceeds $5.00 |

### Notification channels
- `INFO` → `alerts` table only (visible in dashboard)
- `WARN` → `alerts` table + Slack `#ops-alerts` (yellow)
- `CRITICAL` → `alerts` table + Slack `#ops-alerts` (red) + email to `ADMIN_EMAIL`

### Dashboard integration
- Unresolved alert count shown as badge in top nav bar (red for CRITICAL)
- "Active Alerts" panel in Operations Command Center — last 10 unresolved, with "Mark Resolved" per row
- Resolved alerts soft-deleted after 30 days (`deleted_at` timestamp)

---

## 7. Prompt Versioning System

### Workflow
1. Founder opens Prompt Manager panel in dashboard
2. Views current active prompt (full text, scoring weights, version label)
3. Edits prompt in textarea, adds label + notes
4. Clicks "Save as new version" → saved with `active = false`
5. Runs test batch: `POST /api/qualify?prompt_version_id=X` on 20 selected leads
6. Results written to `prompt_test_results`
7. Dashboard shows side-by-side score comparison: active vs. new version
8. If satisfied: "Activate version" → single transaction sets new `active = true`, old `active = false`
9. `prompt_version_activated` written to `audit_log`
10. Rollback: any prior version reactivatable in one click from version history list

**Constraint:** Database enforces that exactly one `prompt_versions` row has `active = true` at any time (check constraint or trigger).

---

## 8. Manual Override Layer

All overrides route through `PATCH /api/leads/[id]/override`. The route:
1. Validates founder session token
2. Writes `audit_log` entry (with `before_state` snapshot)
3. Executes the state change
4. Returns updated record

If step 3 fails, the audit log entry is updated with the error. The intent is always recorded.

### Override actions

| Action | Requires reason | Side effects |
|--------|----------------|-------------|
| Override AI score | ✅ Yes | Recalculates tier; `score_override` audit event |
| Blacklist lead | ✅ Yes | Sets `blacklisted = true`; adds email + business name to `suppression_list`; stops outreach |
| Pause outreach | No | Sets `outreach_paused = true`; n8n skips lead in outreach runs |
| Force archive | No | Sets `status = 'archived'` regardless of current state |
| Whitelist lender | No | Sets `lenders.whitelisted = true`; bypasses criteria matching for manual routing |

---

## 9. Suppression & Deduplication

### Deduplication gate
Runs as a Supabase Edge Function called from within `02_enrichment.json` **before** any Apollo enrichment call. Returns `{ allowed: boolean, reason: string }`. n8n branches on result — blocked leads are skipped and logged.

**4 checks in order:**
1. **Apollo ID exact match** — `SELECT id FROM leads WHERE apollo_id = $1`
2. **Email exact match** — `SELECT id FROM leads WHERE email = $1 AND status NOT IN ('archived','blacklisted')`
3. **Domain block** — extract domain from email, check `suppression_list WHERE type = 'domain'`
4. **Business name fuzzy match** — normalize both names (lowercase, strip LLC/Inc/Corp, remove punctuation), check existing leads for >85% similarity → flag for review (not auto-skip, to avoid false positives)

### Suppression list management
- Blacklisting a lead → auto-adds email + business name to `suppression_list` (type: `email` and `business_name`)
- Founder can manually add entries via "Suppression Manager" panel in Operations Command Center
- Supports: email, domain, business_name, apollo_id, phone
- Entries are permanent unless manually removed by founder

---

## 10. API Usage & Cost Tracking

### Cost constants (environment variables)
```
ANTHROPIC_COST_PER_1K_INPUT_TOKENS
ANTHROPIC_COST_PER_1K_OUTPUT_TOKENS
APOLLO_COST_PER_ENRICHMENT_CALL
SENDGRID_COST_PER_EMAIL
MONTHLY_API_BUDGET_USD
```

Every API call in `lib/anthropic.ts`, `lib/sendgrid.ts`, and Apollo n8n nodes writes to `api_usage_log` after the call completes. Estimated cost is calculated at write time.

### Dashboard metrics (Operations Command Center — API Usage panel)
- Total spend today / this week / rolling 30 days
- Spend breakdown by service (4 bars)
- Average cost per qualified lead
- Average cost per distributed lead
- Budget consumed % with WARN/CRITICAL thresholds

### Morning report inclusion
- Yesterday's total API cost
- Cost-per-lead metric
- Flag in red if cost-per-lead > $5

---

## 11. Distribution Safety — Founder Approval Flow

**Distribution is not automatic in v1.** Qualified leads enter a `pending_approval` queue. The `09_distribution_approval.json` workflow fires only when `distribution_approved_at` is set.

### Approval workflow
```
Lead qualifies (score ≥ 65)
  → status = 'pending_approval'
  → appears in Approval Queue panel
  → founder reviews: business name, score, tier, industry, revenue, matched lenders, estimated revenue
  → Approve → distribution_approved_at = now() → 09_distribution_approval fires → webhook POST to lenders
  → Reject → status = 'rejected_distribution', reason required → audit_log
```

### Batch approval
"Approve all tier-A" button in Approval Queue panel — approves all tier-A leads in one action. Available when founder trusts current batch quality.

### V2 semi-automation path
After 90 days of approval history, the system will identify high-confidence approval patterns (e.g., "tier-A restaurant leads, revenue >$800K, approved 97% of the time"). These leads will be auto-approved after a 4-hour review window. Full automation activates when auto-approval accuracy exceeds 98% over 30 consecutive days.

---

## 12. Operations Command Center

Primary dashboard page. First page opened each morning.

### 8 panels (2×4 grid)

| Panel | Contents |
|-------|---------|
| **System Health** | Green/yellow/red per service (Apollo, Anthropic, SendGrid, n8n, Supabase, webhooks). Last ping timestamp. Click → detail log. |
| **Active Alerts** | Last 10 unresolved WARN/CRITICAL. Severity badge + message + time elapsed. "Mark Resolved" per row. |
| **Pending Approvals** | Count of `pending_approval` leads. Estimated revenue if all approved. "Review Queue" button → approval slide-over. |
| **API Usage** | 4 mini-bars (Anthropic / Apollo / SendGrid / Stripe). Total today vs. daily budget. Cost-per-lead today. |
| **Workflow Status** | Table of all 9 n8n workflows: last run time, status, next run. "Trigger now" button per workflow. |
| **Outreach Health** | Emails sent today. Open rate (7-day rolling). Reply rate (7-day rolling). 14-day sparkline. |
| **Distribution Queue** | Count: pending / delivered today / failed. "Retry failed" button re-triggers webhook for all `failed` records. |
| **Recent AI Actions** | Last 20 `audit_log` entries from `actor_type = 'system'`. Latency flag (>5s). Malformed JSON flag. |

---

## 13. Production Hardening

### Retry strategies
- **n8n HTTP nodes:** 3 retries, exponential backoff — 2s / 4s / 8s delays
- **Webhook delivery:** 3 retries at 60-second intervals → on final failure: WARN alert + `delivery_status = 'failed'`
- **Anthropic API:** 3 retries, 1s initial delay in `lib/anthropic.ts` → on all failing: `status = 'qualification_error'`, excluded from outreach

### Queue handling
- Discovery writes leads in batches of 25
- Enrichment + qualification: cursor-based `LIMIT 50 WHERE status = 'X' ORDER BY created_at ASC`, runs every 5 minutes until queue clear
- Anthropic calls: sequential (1 per second) — not parallel — to respect rate limits

### Rate limiting
- Apollo API: 200 calls/min limit → `Wait` node between batches in n8n
- Anthropic API: sequential processing (1 lead/sec) — never parallel
- SendGrid: 500ms delay between sends in outreach workflow (limit is 100/sec — precautionary)

### Failure recovery
- Leads stuck in intermediate status for >6 hours are flagged as `processing_stalled` at 11PM health check
- Morning report highlights stalled leads
- Dashboard "Reprocess stalled leads" bulk action re-triggers appropriate workflow stage

### Backup strategy
- **Supabase:** PITR enabled (Pro plan). Daily automated backup. 7-day retention window.
- **n8n workflows:** All JSON files committed to private GitHub repo via nightly GitHub Actions
- Pre-migration: manual Supabase backup triggered and ID recorded before any schema change

### Log retention policy
| Log type | Retention |
|----------|----------|
| `audit_log` | Forever (compliance record) |
| `api_usage_log` | 90 days (nightly aggregation + cleanup job) |
| `outreach_history` | 1 year |
| `alerts` (resolved) | 30 days (soft delete via `deleted_at`) |
| n8n execution history | 30 days (n8n settings) |
| Supabase query logs | 7 days (Supabase default) |

---

## 14. Revenue Model & Pricing

**Model: Pay-per-lead with volume discount tiers**

| Product | Price |
|---------|-------|
| Tier A — exclusive (1 lender) | $75–$150 per lead |
| Tier A — shared (up to 3 lenders) | $35–$60 per lead |
| Tier B — exclusive | $40–$80 per lead |
| Tier B — shared | $20–$35 per lead |
| Founding partner rate | 10 Tier-A leads for $500 flat |
| Month 2 bundle | 40 leads/month for $2,500 ($62.50/lead avg) |

Invoicing via Stripe (manual invoice generation in v1). No subscription model at launch.

---

## 15. Daily Automated Workflow

| Time | Action |
|------|--------|
| 6:00 AM | Discovery run — Apollo API query → raw leads |
| 6:30 AM | Enrichment run — Apollo people endpoint → enriched leads |
| 7:00 AM | Qualification run — Anthropic API → scores and tiers |
| 7:30 AM | Morning report — Supabase query → SendGrid email to founder |
| 8:00 AM | Outreach run — qualified leads with no sequence started → Email 1 |
| 12:00 PM | Follow-up check — Email 2 to leads 48h+ since Email 1, no reply |
| 4:00 PM | Final outreach — Email 3 to leads 96h+ since Email 1, no reply |
| 6:00 PM | Distribution trigger — approved leads not yet delivered → webhook |
| 11:00 PM | Health check — stalled leads flagged, zero-discovery alert, workflow error check |

---

## 16. API Routes — 14 Total

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/leads` | GET | Paginated leads list. Filters: `?tier=A&status=qualified` |
| `/api/leads` | POST | Create lead (manual entry) |
| `/api/leads/[id]` | GET | Full lead detail + outreach_history + distributions |
| `/api/leads/[id]` | PATCH | Update lead status or mark replied |
| `/api/leads/[id]/override` | PATCH | Manual override — requires `reason` field. Logs audit_log first. |
| `/api/leads/[id]/approve-distribution` | POST | Set `distribution_approved_at`, trigger distribution workflow |
| `/api/lenders` | GET | All active lenders |
| `/api/lenders` | POST | Create new lender |
| `/api/distribute` | POST | Body: `{lead_id, lender_ids[]}` → fire webhooks, log distributions |
| `/api/qualify` | POST | Body: `{lead_id}` or `{lead_ids[]}` → Anthropic call → write score. Optional: `?prompt_version_id=X` |
| `/api/webhooks/sendgrid` | POST | Receive open/click/bounce events → update `outreach_history` |
| `/api/audit-log` | GET | Filtered audit log for dashboard |
| `/api/alerts` | GET | Unresolved alerts list |
| `/api/alerts/[id]` | PATCH | Mark alert resolved |
| `/api/prompt-versions` | GET | All prompt versions |
| `/api/prompt-versions` | POST | Create new version (saves as inactive) |
| `/api/prompt-versions/[id]/activate` | PATCH | Activate version (deactivates current in transaction) |
| `/api/api-usage` | GET | Usage + cost summary for Operations dashboard |
| `/api/health` | GET | System health check — polled every 5 min by n8n health monitor |

---

## 17. n8n Workflows — 9 Total

| File | Trigger | Purpose |
|------|---------|---------|
| `01_discovery.json` | Cron: every 6h | Apollo API query → write raw leads |
| `02_enrichment.json` | After discovery completes | Dedup gate → Apollo people endpoint → update leads |
| `03_qualification.json` | After enrichment completes | Anthropic API per lead → write score/tier → audit_log |
| `04_outreach.json` | Cron: 8AM, 12PM, 4PM | SendGrid email sequence — Email 1/2/3 logic |
| `05_distribution.json` | Cron: 6PM | (Legacy — replaced by approval flow in v1 hardened) |
| `06_morning_report.json` | Cron: 7:30 AM | Supabase query → SendGrid template → founder inbox |
| `07_health_monitor.json` | Cron: every 15 min | All alert condition checks → Slack + alerts table |
| `08_deduplication_gate.json` | Called from `02_enrichment` | 4-check dedup → returns allowed/blocked |
| `09_distribution_approval.json` | Webhook: `distribution_approved_at` set | Match lead to lenders → webhook POST with retry logic |

---

## 18. Folder Structure

```
operion-ai/
├── apps/
│   └── dashboard/                    # Next.js 14 app
│       ├── app/
│       │   ├── (auth)/
│       │   │   └── login/
│       │   ├── (dashboard)/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx          # Operations Command Center (primary)
│       │   │   ├── leads/
│       │   │   │   └── page.tsx      # Leads table + detail panel
│       │   │   ├── lenders/
│       │   │   │   └── page.tsx      # Lender management
│       │   │   ├── outreach/
│       │   │   │   └── page.tsx      # Outreach history feed
│       │   │   ├── reports/
│       │   │   │   └── page.tsx      # Daily report archive
│       │   │   ├── audit/
│       │   │   │   └── page.tsx      # Audit trail
│       │   │   └── prompts/
│       │   │       └── page.tsx      # Prompt version manager
│       │   └── api/
│       │       ├── leads/
│       │       │   ├── route.ts
│       │       │   └── [id]/
│       │       │       ├── route.ts
│       │       │       ├── override/route.ts
│       │       │       └── approve-distribution/route.ts
│       │       ├── lenders/route.ts
│       │       ├── distribute/route.ts
│       │       ├── qualify/route.ts
│       │       ├── audit-log/route.ts
│       │       ├── alerts/
│       │       │   ├── route.ts
│       │       │   └── [id]/route.ts
│       │       ├── prompt-versions/
│       │       │   ├── route.ts
│       │       │   └── [id]/activate/route.ts
│       │       ├── api-usage/route.ts
│       │       ├── health/route.ts
│       │       └── webhooks/
│       │           └── sendgrid/route.ts
│       ├── components/
│       │   ├── ui/                   # shadcn/ui base components
│       │   ├── ops/
│       │   │   ├── SystemHealth.tsx
│       │   │   ├── ActiveAlerts.tsx
│       │   │   ├── PendingApprovals.tsx
│       │   │   ├── ApiUsage.tsx
│       │   │   ├── WorkflowStatus.tsx
│       │   │   ├── OutreachHealth.tsx
│       │   │   ├── DistributionQueue.tsx
│       │   │   └── RecentAiActions.tsx
│       │   ├── leads/
│       │   │   ├── LeadsTable.tsx
│       │   │   ├── LeadDetailPanel.tsx
│       │   │   ├── LeadStatusBadge.tsx
│       │   │   └── OverrideModal.tsx
│       │   ├── lenders/
│       │   │   ├── LendersTable.tsx
│       │   │   └── AddLenderModal.tsx
│       │   ├── prompts/
│       │   │   ├── PromptVersionList.tsx
│       │   │   ├── PromptEditor.tsx
│       │   │   └── PromptTestResults.tsx
│       │   ├── metrics/MetricCard.tsx
│       │   └── layout/
│       │       ├── Sidebar.tsx
│       │       └── TopBar.tsx         # Alert badge in nav
│       └── lib/
│           ├── supabase/
│           │   ├── client.ts
│           │   ├── server.ts
│           │   └── types.ts           # Generated from schema
│           ├── anthropic.ts           # qualifyLead() + api_usage_log write
│           ├── sendgrid.ts            # sendOutreachEmail() + api_usage_log write
│           ├── stripe.ts              # createInvoice()
│           ├── distribution.ts        # distributeLead() with retry logic
│           └── audit.ts              # writeAuditLog() helper
├── packages/
│   └── database/
│       ├── schema.sql                # All 11 tables + view
│       ├── migrations/
│       └── seed.sql                  # Sample lenders + test leads
├── workflows/                        # n8n JSON exports (9 files)
│   ├── 01_discovery.json
│   ├── 02_enrichment.json
│   ├── 03_qualification.json
│   ├── 04_outreach.json
│   ├── 05_distribution.json
│   ├── 06_morning_report.json
│   ├── 07_health_monitor.json
│   ├── 08_deduplication_gate.json
│   └── 09_distribution_approval.json
└── docs/
    ├── ENV_VARIABLES.md
    ├── SUPABASE_SETUP.md
    └── N8N_SETUP.md
```

---

## 19. Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=

# Outreach
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=

# Lead data
APOLLO_API_KEY=

# Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Ops
ADMIN_EMAIL=
SLACK_WEBHOOK_URL=                     # #ops-alerts channel

# Cost tracking
ANTHROPIC_COST_PER_1K_INPUT_TOKENS=
ANTHROPIC_COST_PER_1K_OUTPUT_TOKENS=
APOLLO_COST_PER_ENRICHMENT_CALL=
SENDGRID_COST_PER_EMAIL=
MONTHLY_API_BUDGET_USD=
```

---

## 20. 4-Week Build Plan

### Week 1 — Data pipeline
- Supabase project setup: all 11 tables, RLS policies, `lead_cost_summary` view
- Suppression table + deduplication Edge Function
- n8n Cloud: workflows 01 (discovery) + 02 (enrichment) + 08 (dedup gate)
- `lib/anthropic.ts`: qualification prompt, API call, JSON parsing, `api_usage_log` write
- n8n workflow 03 (qualification)
- `audit.ts` helper — `writeAuditLog()` used throughout
- n8n workflow 06 (morning report)
- **End of week 1:** Pipeline runs automatically, morning report delivered to inbox

### Week 2 — Outreach + distribution
- `lib/sendgrid.ts`: 3-email templates, send function, `api_usage_log` write
- n8n workflow 04 (outreach) with 48h/96h follow-up logic
- SendGrid webhook → `POST /api/webhooks/sendgrid` → `outreach_history` updates
- Lenders table: manually insert 2–3 lenders via Supabase Studio
- n8n workflow 09 (distribution approval) — webhook-triggered, lender matching, retry logic
- n8n workflow 07 (health monitor) — all alert conditions, Slack + alerts table
- `lib/distribution.ts`: webhook POST, retry, `lead_distributions` write
- **End of week 2:** Full pipeline automated, alerts firing, webhook delivery working

### Week 3 — Admin dashboard
- Next.js setup on Vercel, Supabase Auth (email/password, single admin)
- Operations Command Center: all 8 panels
- Leads table + Lead Detail Panel with all override actions
- Prompt Manager: version list, editor, test runner, side-by-side comparison, activate
- Lender management panel + Add Lender modal
- Audit Trail page
- `POST /api/leads/[id]/approve-distribution` + Approval Queue slide-over
- Stripe invoice generation (`lib/stripe.ts` + button in dashboard)
- **End of week 3:** Founder has full visibility and control. Business can accept payment.

### Week 4 — Polish, go live, first clients
- Fix bugs. Add error + empty states throughout dashboard.
- Onboard 2–3 lenders (webhook URLs + criteria in database)
- Distribute first lead batch manually, verify delivery
- Send first invoices, collect payment
- 48-hour pipeline monitoring, qualification prompt tuning
- **End of week 4:** Paying clients. Running pipeline. Earning revenue.

---

## 21. Features Deferred to v2

Do not build in v1. Not in scope regardless of how simple they seem.

- Public website and lead marketplace
- Lender self-service portal and onboarding wizard
- SMS outreach (Twilio)
- Conversation Agent — inbound reply automation
- Support Agent — helpdesk chatbot
- Analytics Agent — trend analysis
- Executive Reporting Agent — AI-narrative daily briefings
- Lead Seller portal
- Multiple campaigns with per-campaign scoring weights
- Real-time dashboard (Supabase Realtime subscriptions)
- Stripe auto-billing and subscription model
- n8n self-hosted on Railway
- Puppeteer scraping (Apollo covers MVP needs)
- Users/roles table and multi-operator access
- Semi-automated distribution (requires 90 days of approval history)

---

*Operion AI MVP v1 — Frozen Architecture | Confidential*
