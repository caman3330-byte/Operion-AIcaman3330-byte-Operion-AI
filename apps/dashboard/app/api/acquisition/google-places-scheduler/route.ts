import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAcquisitionAdapter } from '@/lib/acquisition/adapters/registry';
import { ACQUISITION_CONFIG } from '@/lib/acquisition/config';
import { checkDuplicate, createDeduplicationKey } from '@/lib/acquisition/deduplication-service';
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

    // Create acquisition batch for this run
    const timestamp = new Date().toISOString();
    const batchCode = `GOOGLE_PLACES_${Date.now()}`;
    const { data: batchData, error: batchError } = (await supabase
      .from('acquisition_import_batches' as any)
      .insert({
        batch_code: batchCode,
        original_filename: `google-places-scheduler-${timestamp}`,
        content_sha256: batchCode, // Use batch code as hash (simplified)
        source_kind: 'ai',
        provider: 'google_places',
        status: 'confirmed',
      })
      .select('id')) as any;

    const batchId = batchData?.[0]?.id;
    if (!batchId || batchError) {
      metrics.errors.push(
        batchError
          ? `Failed to create batch: ${batchError.message}`
          : 'Batch creation failed'
      );
      return NextResponse.json({
        error: 'Failed to create acquisition batch',
        metrics,
      });
    }

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
      batch_id: batchId,
    });

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

        // Deduplicate and insert
        for (const business of discovered) {
          try {
            const dedupKey = createDeduplicationKey({
              business_name: business.business_name || 'Unknown',
              website_url: business.website_url || null,
              phone: business.phone || null,
              city: business.city || null,
              state: business.state || null,
              google_place_id: business.source_record_id || null,
            });

            const { isDuplicate } = await checkDuplicate(supabase, dedupKey);

            if (isDuplicate) {
              metrics.duplicates_skipped++;
              continue;
            }

            // Create identity key for deduplication
            const normalizedName = (business.business_name || 'Unknown')
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '_');
            const normalizedAddress = [business.business_name, business.city, business.state]
              .filter(Boolean)
              .join('_')
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '_');

            // Insert new prospect into acquisition_prospects table
            const { error: insertError } = await (supabase
              .from('acquisition_prospects' as any)
              .insert({
                identity_key: normalizedAddress || normalizedName,
                acquisition_import_batch_id: batchId,
                source_row_number: metrics.new_businesses_inserted + metrics.duplicates_skipped + 1,
                business_name: business.business_name,
                normalized_business_name: normalizedName,
                normalized_address: business.address || '',
                normalized_city: business.city || '',
                normalized_state: business.state || '',
                normalized_zip: business.zip || '',
                normalized_phone: business.phone?.replace(/\D/g, '').slice(-10) || null,
                normalized_email: business.email || null,
                domain: business.website_url ? (() => { try { return new URL(business.website_url).hostname; } catch { return null; } })() : null,
                address: business.address,
                city: business.city,
                state: business.state,
                zip: business.zip,
                website_url: business.website_url,
                source_payload: {
                  provider: 'google_places',
                  place_id: business.source_record_id,
                  phone: business.phone,
                  phone_normalized: business.phone?.replace(/\D/g, '').slice(-10) || null,
                  discovery_date: new Date().toISOString(),
                  discovered_as: `${industry} in ${location}`,
                },
                state_key: 'prospect',
                enrichment_status: 'pending',
              }) as any);

            if (insertError) {
              metrics.errors.push(`Insert failed for ${business.business_name}: ${insertError.message}`);
            } else {
              metrics.new_businesses_inserted++;
            }
          } catch (err) {
            metrics.errors.push(
              `Processing error for ${business.business_name}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        if (result.errors.length > 0) {
          metrics.errors.push(...result.errors.slice(0, 3));
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        metrics.errors.push(`Search failed for ${industry} in ${location}: ${errorMsg}`);
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
