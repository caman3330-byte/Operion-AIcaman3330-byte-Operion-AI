import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { enrichDataProspect } from '@/lib/data-prospects/enrichment';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH_SIZE = 10;
const RATE_LIMIT_MS = 500;

/**
 * Scheduled worker for processing pending data prospect enrichments.
 *
 * This endpoint should be called periodically by an external scheduler (Vercel Cron, etc.)
 * and is NOT dependent on the acquisition endpoint remaining alive.
 *
 * Enrichment is thus durable: prospects remain in 'pending' state until explicitly enriched
 * by this background worker.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;

  try {
    // Optional: Verify cron secret if provided
    const cronSecret = request.nextUrl.searchParams.get('secret');
    if (cronSecret && cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getSupabaseAdmin();

    // Get batch of pending prospects
    const query = (db as any)
      .from('acquisition_prospects')
      .select('id, business_name, enrichment_status')
      .eq('enrichment_status', 'pending')
      .order('created_at')
      .limit(BATCH_SIZE);

    const { data: pendingProspects, error: fetchError } = await query;

    if (fetchError) {
      logger.error('enrich_scheduler_fetch_error', { error: fetchError.message });
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!pendingProspects || pendingProspects.length === 0) {
      return NextResponse.json({
        processed: 0,
        failed: 0,
        duration_ms: Date.now() - startTime,
        message: 'No pending prospects to enrich',
      });
    }

    // Process each prospect
    for (const prospect of pendingProspects) {
      try {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));

        logger.info('enriching_prospect_scheduled', {
          prospect_id: prospect.id,
          business_name: prospect.business_name,
        });

        await enrichDataProspect(prospect.id);
        processed++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn('enrich_prospect_scheduled_failed', {
          prospect_id: prospect.id,
          error: errorMsg,
        });
        failed++;
      }
    }

    const duration = Date.now() - startTime;

    logger.info('enrich_scheduler_complete', {
      processed,
      failed,
      total: pendingProspects.length,
      duration_ms: duration,
    });

    return NextResponse.json({
      processed,
      failed,
      total: pendingProspects.length,
      duration_ms: duration,
      message: `Enriched ${processed} prospects, ${failed} failed`,
    });
  } catch (error) {
    logger.error('enrich_scheduler_error', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enrichment scheduler failed' },
      { status: 500 }
    );
  }
}
