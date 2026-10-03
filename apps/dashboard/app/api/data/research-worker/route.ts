import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { handleRouteError } from '@/lib/errors';
import { createHash } from 'node:crypto';
import { getAcquisitionAdapter } from '@/lib/acquisition/adapters/registry';
import { normalizeImportRows } from '@/lib/acquisition/manual-import';
import { normalizeBusinessLead } from '@/lib/acquisition/normalization';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH_SIZE = 10;
const RATE_LIMIT_MS = 500;

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseAdmin();
    const googlePlacesAdapter = getAcquisitionAdapter('google_places');

    // Get pending research jobs
    const { data: pendingRows, error: fetchError } = await (supabase
      .from('acquisition_import_rows' as any)
      .select('*')
      .eq('status', 'pending')
      .order('created_at')
      .limit(BATCH_SIZE)) as any;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!pendingRows || pendingRows.length === 0) {
      return NextResponse.json({
        processed: 0,
        message: 'No pending research jobs',
      });
    }

    let processed = 0;
    let failed = 0;
    const resultsToInsert: any[] = [];

    for (const row of pendingRows) {
      try {
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));

        // Mark as researching
        await (supabase
          .from('acquisition_import_rows' as any)
          .update({ status: 'researching' })
          .eq('id', row.id)) as any;

        const originalData = row.original_data || {};
        let enrichedData: any = { ...originalData };
        let researchSource = 'uploaded_data';

        // Try to enrich with Google Places
        if (googlePlacesAdapter && originalData.business_name) {
          try {
            const placeResult = await googlePlacesAdapter.discover({
              query: originalData.business_name,
              location: originalData.city && originalData.state
                ? `${originalData.city}, ${originalData.state}`
                : undefined,
              limit: 1,
              sourceTimeoutMs: 5000,
            });

            if (placeResult.records && placeResult.records.length > 0) {
              const place = placeResult.records[0]!;
              enrichedData = {
                ...enrichedData,
                ...place,
              };
              researchSource = 'google_places';
            }
          } catch (err) {
            // If Google Places fails, continue with uploaded data
            console.error('Google Places enrichment error:', err);
          }
        }

        // Normalize the enriched data using existing system
        // The normalizeBusinessLead function returns ManualImportRow compatible format
        const normalized = normalizeBusinessLead(enrichedData);

        // Calculate qualification
        const score = calculateLeadScore(normalized, enrichedData);
        const qualification = determineQualification(normalized, enrichedData);

        // Update the row with research results
        await (supabase
          .from('acquisition_import_rows' as any)
          .update({
            status: 'researched',
            researched_data: enrichedData,
            qualification_score: score,
            qualification_status: qualification,
            research_timestamp: new Date().toISOString(),
          })
          .eq('id', row.id)) as any;

        // Prepare for batch import - use the normalized data
        resultsToInsert.push({
          batch_id: row.batch_id,
          row_number: row.row_number,
          data: normalized,
          source: researchSource,
        });

        processed++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';

        // Mark as failed
        await (supabase
          .from('acquisition_import_rows' as any)
          .update({
            status: 'failed',
            error_message: errorMsg,
          })
          .eq('id', row.id)) as any;

        failed++;
      }
    }

    // Batch insert researched businesses into acquisition_prospects via import_data_prospects RPC
    if (resultsToInsert.length > 0) {
      try {
        const batches = resultsToInsert.reduce((acc: Record<string, any[]>, item: any) => {
          const batchId = item.batch_id;
          if (!acc[batchId]) acc[batchId] = [];
          acc[batchId].push(item.data);
          return acc;
        }, {});

        for (const [batchId, rows] of Object.entries(batches)) {
          const contentHash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
          const normalizedRows = normalizeImportRows(rows as any);

          const { error: importError } = await (supabase.rpc('import_data_prospects' as any, {
            p_filename: `csv-research-${new Date().toISOString()}`,
            p_content_sha256: contentHash,
            p_source_kind: 'manual',
            p_provider: 'csv_research',
            p_uploaded_by: null,
            p_rows: normalizedRows,
          }) as any);

          if (importError) {
            console.error(`Import error for batch ${batchId}:`, importError);
          }
        }
      } catch (err) {
        console.error('Batch import error:', err);
      }
    }

    return NextResponse.json({
      processed,
      failed,
      total: pendingRows.length,
      message: `Researched ${processed} businesses, ${failed} failed`,
    });

  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseAdmin();
    const batchId = request.nextUrl.searchParams.get('batch_id');

    if (!batchId) {
      // Get overall stats
      const { data: batches } = await (supabase
        .from('acquisition_import_batches' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)) as any;

      const stats = await Promise.all(
        (batches || []).map(async (batch: any) => {
          const { count: total } = await (supabase
            .from('acquisition_import_rows' as any)
            .select('*', { count: 'exact', head: true })
            .eq('batch_id', batch.id)) as any;

          const { count: pending } = await (supabase
            .from('acquisition_import_rows' as any)
            .select('*', { count: 'exact', head: true })
            .eq('batch_id', batch.id)
            .eq('status', 'pending')) as any;

          const { count: researched } = await (supabase
            .from('acquisition_import_rows' as any)
            .select('*', { count: 'exact', head: true })
            .eq('batch_id', batch.id)
            .eq('status', 'researched')) as any;

          const { count: failed } = await (supabase
            .from('acquisition_import_rows' as any)
            .select('*', { count: 'exact', head: true })
            .eq('batch_id', batch.id)
            .eq('status', 'failed')) as any;

          return {
            batch_id: batch.id,
            filename: batch.filename,
            total: total || 0,
            pending: pending || 0,
            researched: researched || 0,
            failed: failed || 0,
            created_at: batch.created_at,
          };
        })
      );

      return NextResponse.json({ batches: stats });
    }

    // Get specific batch progress
    const { data: rows } = await (supabase
      .from('acquisition_import_rows' as any)
      .select('*')
      .eq('batch_id', batchId)
      .order('row_number')) as any;

    if (!rows) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const statuses = rows.reduce((acc: Record<string, number>, row: any) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      batch_id: batchId,
      total: rows.length,
      statuses,
      rows: rows.map((r: any) => ({
        row_number: r.row_number,
        status: r.status,
        score: r.qualification_score,
        qualification: r.qualification_status,
        error: r.error_message,
      })),
    });

  } catch (error) {
    return handleRouteError(error);
  }
}

// Calculate lead score based on verified information
function calculateLeadScore(normalized: any, enriched: any): number {
  let score = 0;

  // Verified fields (highest weight)
  if (normalized.business_name && enriched.google_place_id) score += 25;
  if (normalized.website_url) score += 15;
  if (normalized.phone) score += 15;
  if (normalized.address) score += 10;

  // Data completeness
  if (normalized.email) score += 10;
  if (normalized.industry) score += 10;
  if (normalized.city && normalized.state) score += 10;

  return Math.min(100, Math.max(0, score));
}

// Determine qualification level
function determineQualification(normalized: any, enriched: any): string {
  const hasWebsite = !!normalized.website_url;
  const hasPhone = !!normalized.phone;
  const hasEmail = !!normalized.email;
  const hasGooglePlace = !!enriched.google_place_id;
  const hasBusiness = !!normalized.business_name;

  // Strong fit: multiple verified signals
  if (hasGooglePlace && hasWebsite && (hasPhone || hasEmail)) {
    return 'strong_fit';
  }

  // Possible fit: web or Google presence plus contact
  if ((hasWebsite || hasGooglePlace) && hasPhone) {
    return 'possible_fit';
  }

  // Weak fit: has business name but limited verification
  if (hasBusiness && !hasWebsite && !hasGooglePlace) {
    return 'weak_fit';
  }

  // Not a fit: no viable business identity
  if (!hasBusiness) {
    return 'not_a_fit';
  }

  return 'needs_review';
}
