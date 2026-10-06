# Data Enrichment Scheduler

## Overview

The DATA enrichment system uses a durable, background-worker pattern to ensure enrichment completes regardless of serverless function termination.

### Architecture

1. **Acquisition Phase**: When new prospects are discovered via AI acquisition or manual upload, they are inserted with `enrichment_status = 'pending'`
2. **Background Scheduler**: A separate scheduled worker processes pending prospects in batches
3. **Enrichment Execution**: Each prospect is enriched via provider APIs (Google Places, Apollo, etc.)
4. **State Preservation**: Enrichment results are durably stored in the database

### Why Durable Scheduling?

Fire-and-forget HTTP triggers (like fetching from one serverless function to another) are **not durable**:
- If the originating function terminates before the trigger completes, enrichment jobs are lost
- HTTP requests may timeout or fail silently
- State is not preserved across function restarts

The scheduler pattern solves this by:
- Storing work items in the database (`acquisition_prospects.enrichment_status = 'pending'`)
- Processing work items in a separate scheduled job
- Retrying failed items automatically
- Surviving function restarts and infrastructure changes

## Setup

### Vercel Cron Jobs

Configure a cron job in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/data/enrich-scheduler",
      "schedule": "0 * * * *"
    }
  ]
}
```

This runs the enrichment scheduler every hour.

### Environment Variables

Set in your `.env.production`:

```bash
# Optional: Secure the scheduler endpoint
CRON_SECRET=your-secret-value
```

Then update your cron configuration to pass the secret:

```json
{
  "crons": [
    {
      "path": "/api/data/enrich-scheduler?secret=your-secret-value",
      "schedule": "0 * * * *"
    }
  ]
}
```

### Local Testing

Test the scheduler locally without secrets:

```bash
curl http://localhost:3000/api/data/enrich-scheduler
```

Or with a secret:

```bash
curl http://localhost:3000/api/data/enrich-scheduler?secret=test-secret
```

## Endpoints

### POST /api/data/enrich-pending

**Direct enrichment trigger** (for testing or manual triggering)

Response:
```json
{
  "processed": 5,
  "failed": 1,
  "total": 6,
  "duration_ms": 3450,
  "message": "Enriched 5 prospects, 1 failed"
}
```

### GET /api/data/enrich-scheduler

**Scheduled worker** (called by cron)

Query Parameters:
- `secret`: Optional cron secret for authorization

Response: Same as `/api/data/enrich-pending`

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
