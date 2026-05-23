# Operion Capital Monday Operational Test Plan

Use this runbook for full workflow testing after deployment/environment checks are green.

## 1. Runtime Readiness

- Open `/admin` and confirm the Operations Admin page loads.
- Open `/supervisor` and confirm MCA Operations Flow and Email Operations panels load.
- Run `/api/health` and confirm Supabase, auth, AI providers, SendGrid, and operational schemas are expected for the target environment.
- From `/admin`, run read-only Smoke Test.
- From `/admin`, run Prelaunch Validation without write tests first.

## 2. Merchant Intake

- Submit one realistic application through `/apply`.
- Confirm a `business_applications` row is created.
- Confirm corresponding lead, AI task, CRM activity, document request records, and audit entries are created.
- Open `/merchants` and confirm the merchant appears.
- Open the merchant detail page and confirm underwriting, lender routing, documents, AI tasks, and activity panels render.

## 3. Lifecycle And Underwriting

- Move the merchant lifecycle from the merchant detail page through:
  - `submitted`
  - `ai_review`
  - `qualified`
  - `underwriting_review`
  - `reviewed`
- Confirm each transition writes CRM activity and preserves metadata lifecycle history.
- Run AI qualification for the merchant and confirm lead score, underwriting review, AI task log, and API usage records update.

## 4. Lender Routing

- Confirm at least one active lender exists with criteria.
- Run lender distribution from the operations API or lender UI.
- Confirm `lender_matches` are created with match score and criteria snapshot.
- Move qualified application to `routed` or `submitted_to_lender`.
- Confirm `/supervisor` and `/admin` lender routing metrics update.

## 5. Email Operations

- From `/admin`, send a SendGrid test email.
- Send merchant acknowledgement email.
- Send lender package email.
- Confirm branded Operion Capital templates render correctly.
- Confirm `api_usage_logs` records SendGrid delivery attempts.
- Confirm failures generate clear operator-visible errors.

## 6. Workflow And Simulation

- Open `/testing`.
- Run a 10-lead simulation first.
- Run replay against the generated simulation run.
- Pause and resume workers.
- Export logs.
- Run readiness report.
- Confirm diagnostics show worker health, queue health, retry counts, failures, and bottlenecks.

## 7. Exit Criteria

- No unhandled runtime errors in local logs.
- Typecheck, lint, and production build pass.
- Intake, lifecycle, AI scoring, lender matching, email, and reporting each produce persisted records.
- `/admin`, `/supervisor`, `/testing`, `/merchants`, `/leads`, `/lenders`, and `/outreach` are usable by an internal operator.
- Founder review queue clearly shows pending approvals, alerts, stale leads, failed AI tasks, and workflow failures.
