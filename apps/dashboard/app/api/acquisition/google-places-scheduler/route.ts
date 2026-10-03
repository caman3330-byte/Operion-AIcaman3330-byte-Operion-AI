import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAcquisitionAdapter } from '@/lib/acquisition/adapters/registry';
import { ACQUISITION_CONFIG } from '@/lib/acquisition/config';
import { normalizeImportRows } from '@/lib/acquisition/manual-import';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface AcquisitionRun {
  timestamp: string;
  searches_executed: number;
  businesses_discovered: number;
  new_businesses_inserted: number;
  duplicates_skipped: number;
  errors: string[];
  status: 'success' | 'partial_success' | 'failed';
}

export async function GET(request: NextRequest) {
  const runId = `run_${Date.now()}`;
  const metrics: AcquisitionRun = {
    timestamp: new Date().toISOString(),
    searches_executed: 0,
    businesses_discovered: 0,
    new_businesses_inserted: 0,
    duplicates_skipped: 0,
    errors: [],
    status: 'success',
  };

  try {
    // Verify cron secret if provided
    const cronSecret = request.nextUrl.searchParams.get('secret');
    if (cronSecret && cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ACQUISITION_CONFIG.enabled) {
      return NextResponse.json({ message: 'Acquisition disabled', metrics });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Get acquisition history
    const { data: history } = (await supabase
      .from('acquisition_history' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)) as any;

    const lastRun = history?.[0];

    // Determine which program to run next (round-robin based on priority)
    const program = ACQUISITION_CONFIG.searchPrograms[0];
    if (!program) {
      return NextResponse.json({
        error: 'No search programs configured',
        metrics,
      });
    }

    logger.info('acquisition_scheduler_started', {
      run_id: runId,
      program: program.id,
    });

    // Collect all discovered businesses from searches
    const allDiscovered: Array<any> = [];

    // Execute searches for this program
    for (let i = 0; i < program.industries.length && i < ACQUISITION_CONFIG.limits.maxSearchesPerRun; i++) {
      const industry = program.industries[i];
      const location = program.locations[i % program.locations.length];

      // Rate limiting
      await new Promise((resolve) =>
        setTimeout(resolve, ACQUISITION_CONFIG.limits.delayBetweenSearchesMs)
      );

      try {
        const adapter = getAcquisitionAdapter('google_places');
        const result = await adapter.discover({
          query: industry,
          location: location,
          limit: program.maxResultsPerSearch,
          sourceTimeoutMs: ACQUISITION_CONFIG.limits.apiTimeoutMs,
        });

        metrics.searches_executed++;
        const discovered = result.records || [];
        metrics.businesses_discovered += discovered.length;

        // Add source info to each record
        allDiscovered.push(
          ...discovered.map((record: any) => ({
            ...record,
            industry: record.industry || industry,
            source: 'google_places',
            discovered_as: `${industry} in ${location}`,
          }))
        );

        if (result.errors.length > 0) {
          metrics.errors.push(...result.errors.slice(0, 3));
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        metrics.errors.push(`Search failed for ${industry} in ${location}: ${errorMsg}`);
        metrics.status = 'partial_success';
      }
    }

    // Use canonical import_data_prospects RPC to persist all businesses
    if (allDiscovered.length > 0) {
      try {
        // Normalize records to ManualImportRow format
        const rows = normalizeImportRows(allDiscovered);
        const contentHash = createHash('sha256')
          .update(JSON.stringify(allDiscovered))
          .digest('hex');

        const { data: importResult, error: importError } = await supabase
          .rpc('import_data_prospects', {
            p_filename: `google-places-scheduler-${new Date().toISOString()}`,
            p_content_sha256: contentHash,
            p_source_kind: 'ai',
            p_provider: 'google_places',
            p_uploaded_by: null,
            p_rows: rows,
          }) as any;

        if (importError) {
          metrics.errors.push(`RPC import failed: ${importError.message}`);
          metrics.status = 'partial_success';
        } else if (importResult) {
          metrics.new_businesses_inserted = importResult.created?.length || 0;
          metrics.duplicates_skipped = importResult.duplicates?.length || 0;
          metrics.errors.push(...(importResult.failed?.map((f: any) => `${f.business_name}: ${f.error}`) || []));
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        metrics.errors.push(`Import batch failed: ${errorMsg}`);
        metrics.status = 'partial_success';
      }
    }

    // Store run metrics
    await (supabase
      .from('acquisition_history' as any)
      .insert({
        run_id: runId,
        program_id: program.id,
        metrics: metrics,
        created_at: new Date().toISOString(),
      }) as any);

    logger.info('acquisition_scheduler_completed', {
      run_id: runId,
      ...metrics,
    });

    return NextResponse.json({
      message: 'Acquisition run completed',
      metrics,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('acquisition_scheduler_failed', { error: errorMessage });

    metrics.errors.push(errorMessage);
    metrics.status = 'failed';

    return NextResponse.json(
      {
        error: 'Acquisition scheduler failed',
        metrics,
      },
      { status: 500 }
    );
  }
}
