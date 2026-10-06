import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { enrichDataProspect } from '@/lib/data-prospects/enrichment';
import { handleRouteError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH_SIZE = 5;
const RATE_LIMIT_MS = 1000;

/**
 * Worker endpoint to automatically enrich pending acquisition prospects.
 * Called by scheduler or manually to process prospects waiting for enrichment.
 *
 * GET: Get status of pending enrichment queue
 * POST: Process next batch of pending prospects
 */

export async function GET(request: NextRequest) {
  try {
    const db = getSupabaseAdmin();

    // Count prospects by enrichment status
    const statuses = await Promise.all([
      db.from('acquisition_prospects').select('id', { count: 'exact', head: true }).eq('enrichment_status', 'pending'),
      db.from('acquisition_prospects').select('id', { count: 'exact', head: true }).eq('enrichment_status', 'enriching'),
      db.from('acquisition_prospects').select('id', { count: 'exact', head: true }).eq('enrichment_status', 'enriched'),
      db.from('acquisition_prospects').select('id', { count: 'exact', head: true }).eq('enrichment_status', 'no_match'),
      db.from('acquisition_prospects').select('id', { count: 'exact', head: true }).eq('enrichment_status', 'failed'),
    ]);

    return NextResponse.json({
      queue_status: {
        pending: statuses[0].count ?? 0,
        enriching: statuses[1].count ?? 0,
        enriched: statuses[2].count ?? 0,
        no_match: statuses[3].count ?? 0,
        failed: statuses[4].count ?? 0,
      },
      message: 'Enrichment queue status',
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;

  try {
    const db = getSupabaseAdmin();

    // Get pending prospects (not already enriching)
    const { data: pendingProspects, error: fetchError } = await (db
      .from('acquisition_prospects')
      .select('id, business_name, address, city, state, zip, enrichment_status, updated_at')
      .eq('enrichment_status', 'pending')
      .order('created_at')
      .limit(BATCH_SIZE)) as any;

    if (fetchError) {
      logger.error('enrich_pending_fetch_error', { error: fetchError.message });
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
        // Rate limiting between enrichment calls
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));

        logger.info('enriching_prospect', {
          prospect_id: prospect.id,
          business_name: prospect.business_name,
        });

        // Call existing enrichment function
        await enrichDataProspect(prospect.id);
        processed++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);

        logger.warn('enrich_prospect_failed', {
          prospect_id: prospect.id,
          error: errorMsg,
        });

        // Mark as failed if error is permanent (auth, not found, etc)
        if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('not configured')) {
          await db
            .from('acquisition_prospects')
            .update({
              enrichment_status: 'failed',
              enrichment_error: errorMsg,
            })
            .eq('id', prospect.id);
        }

        failed++;
      }
    }

    const duration = Date.now() - startTime;

    logger.info('enrich_pending_complete', {
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
    return handleRouteError(error);
  }
}
