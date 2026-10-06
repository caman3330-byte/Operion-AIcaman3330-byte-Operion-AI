import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireFounder(request);
    const db = getSupabaseAdmin();
    const { id } = await params;
    const payload = await request.json().catch(() => ({}));
    const reason = typeof payload?.reason === 'string' ? payload.reason : null;

    // Qualification is an explicit founder review action. It does not send
    // outreach or create a campaign; those remain separate approved actions.
    const { data, error } = await (db
      .from('leads') as any)
      .update({
        status: 'qualified',
        qualified_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await (db.from('lead_activity' as any) as any).insert({
      lead_id: id,
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
