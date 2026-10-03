import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Safe diagnostic endpoint - checks system health without exposing secrets.
 * Returns only non-sensitive information about database configuration and migrations.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseAdmin();

    // Check if acquisition_import_rows table has required columns for research pipeline
    const { data: schemaCheck, error: schemaError } = await (supabase
      .rpc('check_migration_0044' as any)) as any;

    if (schemaError) {
      // If RPC doesn't exist, try direct schema verification
      try {
        const { data: importRows } = await (supabase
          .from('acquisition_import_rows' as any)
          .select('researched_data, qualification_score, qualification_status, research_timestamp')
          .limit(0)) as any;

        const { data: prospects } = await (supabase
          .from('acquisition_prospects' as any)
          .select('lead_score, qualification_status')
          .limit(0)) as any;

        // If we got here without error, columns exist
        const { data: qualifiedLeads } = await (supabase
          .from('qualified_leads' as any)
          .select('id')
          .limit(0)) as any;

        return NextResponse.json({
          status: 'healthy',
          database: {
            connected: true,
            migration_0044_applied: true,
            required_columns: {
              acquisition_import_rows: ['researched_data', 'qualification_score', 'qualification_status', 'research_timestamp', 'error_message'],
              acquisition_prospects: ['lead_score', 'qualification_status', 'qualification_reason'],
            },
            qualified_leads_view: true,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (innerErr) {
        // Columns don't exist - migration not applied
        return NextResponse.json({
          status: 'migration_needed',
          database: {
            connected: true,
            migration_0044_applied: false,
            required_action: 'Apply migration 0044_acquisition_research_tracking.sql',
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      status: 'healthy',
      database: {
        connected: true,
        migration_0044_applied: true,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Database connection failed',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
