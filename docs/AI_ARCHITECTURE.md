# Operion AI Architecture

Operion AI Phase 2 separates AI providers, workflows, task execution, and persistence.

## Provider Layer

- `apps/dashboard/lib/ai/openai.ts`: OpenAI structured output adapter using strict JSON Schema and Zod validation.
- `apps/dashboard/lib/ai/claude.ts`: Claude JSON workflow adapter for underwriting reasoning, lender fit, and executive summaries.
- `apps/dashboard/lib/ai/router.ts`: Central provider/workflow router.

OpenAI is used for structured extraction, outreach drafts, CRM activity records, and strict-schema operational outputs. Claude is used for deeper funding reasoning, underwriting analysis, lender fit reasoning, and founder summaries.

## Workflow Layer

- `apps/dashboard/lib/ai/workflows/openai-workflows.ts`
- `apps/dashboard/lib/ai/workflows/claude-workflows.ts`
- `apps/dashboard/lib/ai/workflows/task-dispatcher.ts`

The dispatcher claims queued records from `ai_tasks`, runs the routed workflow, writes `ai_task_logs`, records `api_usage_logs`, updates lead/application lifecycle state, and creates approval records when an AI result requires supervisor review.

## Structured Outputs

Strict OpenAI schemas exist for:

- Lead extraction
- Underwriting summaries
- Lender recommendations
- Outreach generation
- CRM activity generation

Each schema is defined in `apps/dashboard/lib/ai/workflows/structured-schemas.ts` and validated again with Zod after the provider response.

## Agents

Phase 2 agents are registered from `apps/dashboard/lib/ai/agents.ts`:

- `sales_agent`
- `underwriting_agent`
- `outreach_agent`
- `support_agent`
- `analytics_agent`
- `executive_manager_agent`

These agents use Supabase-backed queues, execution logs, retries, cost tracking, and approval escalation.

## API Routes

- `GET /api/ai/tasks`
- `POST /api/ai/tasks`
- `POST /api/ai/tasks/dispatch`
- `GET /api/ai/agents`
- `POST /api/ai/agents`
- `POST /api/ai/workflows/structured`

All routes require internal role access or founder access through Supabase Auth/server-side auth guards.
