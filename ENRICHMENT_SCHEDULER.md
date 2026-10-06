# Data Enrichment Architecture

## Overview

The DATA enrichment system integrates with OPERION's existing worker and orchestration infrastructure to ensure enrichment completes durably regardless of serverless function termination.

### Architecture

1. **Acquisition Phase**: When new prospects are discovered via AI acquisition or manual upload, they are inserted with `enrichment_status = 'pending'` in the `acquisition_prospects` table
2. **Task Queue**: Enrichment work is managed through OPERION's existing `agent_task_queue` system (not a separate scheduler)
3. **Worker Orchestration**: The existing worker runtime (`worker-runtime.ts`) claims and executes enrichment tasks
4. **Enrichment Execution**: Each prospect is enriched via provider APIs (Google Places, Apollo, etc.)
5. **State Preservation**: Enrichment results are durably stored in the database with atomic updates

### Why Integrate with Existing Worker System?

Fire-and-forget HTTP triggers (like fetching from one serverless function to another) are **not durable**:
- If the originating function terminates before the trigger completes, enrichment jobs are lost
- HTTP requests may timeout or fail silently
- State is not preserved across function restarts

Integration with OPERION's existing worker/orchestration system solves this by:
- Storing work items durably in the database (`acquisition_prospects.enrichment_status = 'pending'`)
- Using OPERION's proven task queue (`agent_task_queue`) for reliable work distribution
- Atomic claiming via optimistic locking (UPDATE with WHERE conditions)
- Built-in retry logic and heartbeat tracking
- Surviving function restarts and infrastructure changes
- Reusing existing concurrency-safe mechanisms

### Relationship to Existing Worker Runtime

DATA enrichment should be configured as a workflow task type that integrates with:
- `/api/orchestration/workers/tick` (existing worker endpoint)
- `agent_task_queue` table (existing task queue)
- `orchestrationRepository.claimTask()` (existing atomic claim mechanism)
- Worker heartbeat and lease tracking

This avoids duplicating scheduler logic already present in `worker-runtime.ts`.

## Integration Steps

### 1. Create DATA Enrichment Workflow Type

Add to `workflow_routes` table:

```sql
INSERT INTO workflow_routes (workflow_key, department_key, role, name, description, active)
VALUES (
  'data_enrichment',
  'research',
  'enrichment_worker',
  'DATA Enrichment',
  'Process pending DATA prospect enrichment via external providers',
  true
);
```

### 2. Configure Task Creation on Prospect Import

When prospects are created with `enrichment_status='pending'`:
- Create corresponding `agent_task_queue` entry with `workflow_key='data_enrichment'`
- Use existing `orchestrationRepository.createTask()`
- Pass prospect ID in task context

### 3. Implement Enrichment Execution in Worker Runtime

Add to execution modules or worker tick handler:
- Match workflow_key='data_enrichment'
- Extract prospect ID from task context
- Call existing `enrichDataProspect(prospect_id)`
- Update task status on completion (completed/failed)

### 4. Existing Endpoints for Manual Trigger

For testing/manual enrichment (not primary workflow):

**POST /api/data/enrich-pending** (existing endpoint)
- Direct enrichment trigger
- Processes single or batch of pending prospects
- Use for testing or operator intervention only

## Configuration

### Batch Size

Edit `BATCH_SIZE` in `/api/data/enrich-scheduler/route.ts`:

```typescript
const BATCH_SIZE = 10; // Process 10 prospects per run
const RATE_LIMIT_MS = 500; // Wait 500ms between prospects
```

Adjust based on:
- API rate limits (Google Places: 50/sec, Apollo: varies)
- Execution time (max 300s per Vercel cron job)
- Database load

### Rate Limiting

The scheduler respects built-in rate limiting:
- `RATE_LIMIT_MS = 500`: Wait between enrichment calls
- Prevents overwhelming external APIs
- Stays within Vercel execution time limits

## Monitoring

### Check Queue Status

```bash
curl http://localhost:3000/api/data/enrich-pending
```

Shows count of:
- Pending prospects (not yet enriched)
- Enriched prospects
- Failed prospects

### View Logs

Logs are written to your logging service:
- `enrich_scheduler_complete`: Successful scheduler run
- `enriching_prospect_scheduled`: Individual prospect processing
- `enrich_prospect_scheduled_failed`: Individual prospect failure

## Troubleshooting

### Prospects stuck in "pending"

1. Check if scheduler is configured in `vercel.json`
2. Verify `CRON_SECRET` matches if configured
3. Check logs for errors
4. Run `/api/data/enrich-pending` manually to test

### API rate limits

If enrichment is failing with rate limit errors:
1. Increase `RATE_LIMIT_MS`
2. Decrease `BATCH_SIZE`
3. Configure provider API keys (Google Places, Apollo)

### Database connection issues

Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in production environment.

## Related Files

- `/api/data/enrich-scheduler/route.ts`: Scheduler implementation
- `/api/data/enrich-pending/route.ts`: Direct enrichment endpoint
- `/api/data/acquire/route.ts`: AI acquisition (uses pending enrichment)
- `/lib/data-prospects/enrichment.ts`: Core enrichment logic
