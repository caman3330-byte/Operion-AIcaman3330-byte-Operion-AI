# Manager-Agent Architecture

## Purpose

Operion AI uses a founder-supervised multi-agent architecture. Agents do not act as unmanaged autonomous workers in MVP v1. They receive bounded tasks through API routes, persist state in Supabase, emit audit records, and escalate approval-sensitive actions to the founder dashboard.

## Hierarchy

- Executive Manager Agent supervises all departments and produces founder-facing summaries, KPIs, alerts, approvals, and reports.
- Department manager agents supervise their specialized agents.
- Specialist agents own bounded operational surfaces such as lead intake, outreach, underwriting, risk checks, social content, and SEO.

Founder dashboards should show summarized state only: reports, alerts, KPIs, approvals, costs, and high-level task outcomes.

## Core Tables

Migration `packages/database/migrations/0003_multi_agent_architecture.sql` adds:

- `agent_departments`
- `agent_definitions`
- `agent_task_queue`
- `agent_messages`
- `agent_memory`
- `agent_shared_context`
- `workflow_routes`
- `agent_approval_requests`
- `agent_performance_metrics`
- `executive_reports`

RLS is enabled on all tables. Server-side API routes use `SUPABASE_SERVICE_ROLE_KEY`.

## Runtime Flow

1. A workflow trigger arrives from the app, n8n, or a future integration.
2. `/api/orchestration/route-workflow` resolves the active `workflow_routes` entry.
3. The route creates an `agent_task_queue` item for the primary agent.
4. Approval-sensitive workflows create an `agent_approval_requests` record and block the task.
5. The supervisor/manager sends an `agent_messages` handoff to the assigned agent.
6. Shared workflow context is stored in `agent_shared_context`.
7. Audit records capture routing, approvals, and report generation.

## Current Integrations

- Supabase-native persistence
- API-first orchestration routes
- Founder/API-key protected route access
- Anthropic-ready manager plan layer
- n8n-ready workflow route triggers
- Future multi-model compatibility via service-layer boundaries

## Next Expansion Points

- Add worker execution loops for task states.
- Add n8n webhooks that call orchestration APIs with `OPERION_INTERNAL_API_KEY`.
- Add model-provider adapter for Claude/OpenAI routing.
- Add department-specific SLA and cost thresholds.
- Add MT5/Match-Trader integration adapters behind dedicated service modules when trading workflows are approved.
