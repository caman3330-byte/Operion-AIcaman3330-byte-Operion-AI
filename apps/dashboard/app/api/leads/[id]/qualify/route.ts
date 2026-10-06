import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireFounder(request);
    const db = getSupabaseAdmin();
    const { reason } = await request.json();

    // Update lead status to outreach_ready and record qualification
    const { data, error } = await db
      .from('leads')
      .update({
        status: 'outreach_ready',
        qualified_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await db.from('lead_activity').insert({
      lead_id: params.id,
      action: 'qualified',
      details: { reason: reason || null }
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('[leads qualify]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to qualify lead' },
      { status: 500 }
    );
  }
}
