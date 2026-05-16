# Next Steps

## Immediate

1. Apply Supabase migrations `0004` through `0009` if they are not already applied.
2. Set `OPENAI_API_KEY` and Apollo/SendGrid keys when those integrations are ready for live calls.
3. Create or update founder/operator users in `profiles.role` as `founder`, `supervisor`, or `staff`.
4. Run a live application submission through `/apply`.
5. Run `POST /api/ai/tasks/dispatch` to process queued AI work.

## Phase 2 Completion Checks

- Confirm lead lifecycle transitions: `raw -> qualified -> reviewed -> routed -> funded/rejected`.
- Confirm AI task logs are written for each provider call.
- Confirm approval records are created when AI results require supervisor review.
- Confirm supervisor dashboard metrics reflect `ai_tasks`, underwriting queue, lender matches, outreach logs, and cost totals.

## Phase 3 Recommended Build

- Add Supabase Realtime subscriptions for supervisor metrics.
- Add document upload and storage bucket policies.
- Add SendGrid approval-gated send execution.
- Add lender submission webhooks and lender response ingestion.
- Add production CRM sync mappings.
- Add durable scheduled workers for Vercel or Supabase Edge Functions.
