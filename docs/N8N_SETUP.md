# n8n Setup

The `workflows/` directory contains MVP v1 workflow placeholders aligned to the frozen architecture. They are intentionally minimal so credentials, exact schedules, and production webhook URLs can be configured inside n8n without fake lead-processing logic.

## Workflows

1. `01_discovery.json`
2. `02_enrichment.json`
3. `03_qualification.json`
4. `04_outreach.json`
5. `05_distribution.json`
6. `06_morning_report.json`
7. `07_health_monitor.json`
8. `08_deduplication_gate.json`
9. `09_distribution_approval.json`
10. `10_orchestration_worker_tick.json`
11. `11_orchestration_route_webhook.json`

## Orchestration Endpoints

- Lead intake: `POST /api/orchestration/route-workflow` with `workflow_key=lead_intake`
- Outreach: `POST /api/orchestration/route-workflow` with `workflow_key=outreach_campaign`
- CRM sync: `POST /api/orchestration/route-workflow` with a CRM-specific context payload
- Lender distribution: `POST /api/orchestration/route-workflow` with `workflow_key=lender_matching`
- Reporting: `POST /api/orchestration/route-workflow` with `workflow_key=reporting_automation`
- Worker processing: `POST /api/orchestration/workers/tick`

All n8n calls must include `x-operion-internal-key: OPERION_INTERNAL_API_KEY`.

## Required Credentials

- Supabase service role HTTP credential
- Apollo API credential
- Anthropic API credential
- SendGrid credential
- Slack webhook credential
- Operion dashboard API base URL
- `OPERION_INTERNAL_API_KEY` sent as `x-operion-internal-key`

## Operational Rule

Every workflow that mutates state should write to `audit_log` before the mutation. If a workflow fails after the intent is logged, write a second failure event rather than updating the original audit row.
