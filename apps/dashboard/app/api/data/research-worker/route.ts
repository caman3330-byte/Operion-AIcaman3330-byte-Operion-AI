import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { handleRouteError } from '@/lib/errors';
import { createHash } from 'node:crypto';
import { getAcquisitionAdapter } from '@/lib/acquisition/adapters/registry';
import { normalizeImportRows } from '@/lib/acquisition/manual-import';
import { researchBusiness, qualifyBusiness, researchToImportRow } from '@/lib/data-prospects/research-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH_SIZE = 10; // Process 10 rows at a time
const RATE_LIMIT_MS = 500; // Delay between API calls

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

        // Research the business
        const researchResult = await researchBusiness(originalData, googlePlacesAdapter);

        // Qualify and score
        const qualification = await qualifyBusiness(originalData, researchResult);

        // Convert to import row format
        const importRow = researchToImportRow(originalData, researchResult, qualification);

        // Update the row with research results
        await (supabase
          .from('acquisition_import_rows' as any)
          .update({
            status: 'researched',
            researched_data: importRow,
            qualification_score: qualification.lead_score,
            qualification_status: qualification.fit_level,
            research_timestamp: new Date().toISOString(),
          })
          .eq('id', row.id)) as any;

        // Prepare for batch import
        resultsToInsert.push({
          batch_id: row.batch_id,
          row_number: row.row_number,
          data: importRow,
          qualification: qualification,
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
        const batches = resultsToInsert.reduce((acc, item) => {
          const batchId = item.batch_id;
          if (!acc[batchId]) acc[batchId] = [];
          acc[batchId].push(item.data);
          return acc;
        }, {} as Record<string, any[]>);

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

// GET endpoint to check research progress
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
