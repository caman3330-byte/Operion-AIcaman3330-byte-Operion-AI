import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { ACQUISITION_CONFIG } from '@/lib/acquisition/config';
import { handleRouteError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const supabase = await getSupabaseAdmin();

    // Get latest run metrics
    const { data: latestRun, error: historyError } = await (supabase
      .from('acquisition_history' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)) as any;

    const lastRun = latestRun?.[0];

    // Get current counts
    const { data: totalCount } = (await supabase
      .from('acquisition_prospects' as any)
      .select('*', { count: 'exact' })
      .eq('provider', 'google_places')
      .eq('source_kind', 'ai')) as any;

    const { data: recentCount } = (await supabase
      .from('acquisition_prospects' as any)
      .select('*', { count: 'exact' })
      .eq('provider', 'google_places')
      .eq('source_kind', 'ai')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())) as any;

    // Calculate next run time
    const cronExpression = ACQUISITION_CONFIG.schedule.cronExpression;
    const nextRun = calculateNextRun(cronExpression);

    return NextResponse.json({
      status: {
        enabled: ACQUISITION_CONFIG.enabled,
        provider: ACQUISITION_CONFIG.provider,
        schedule: {
          expression: cronExpression,
          description: ACQUISITION_CONFIG.schedule.description,
          nextRunAt: nextRun,
        },
      },
      metrics: {
        totalAcquired: totalCount || 0,
        acquiredLast24h: recentCount || 0,
        lastRun: lastRun
          ? {
              timestamp: lastRun.created_at,
              program: lastRun.program_id,
              ...lastRun.metrics,
            }
          : null,
      },
      configuration: {
        searchPrograms: ACQUISITION_CONFIG.searchPrograms.map((p) => ({
          id: p.id,
          industriesCount: p.industries.length,
          locationsCount: p.locations.length,
          priority: p.priority,
        })),
        limits: ACQUISITION_CONFIG.limits,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function calculateNextRun(cronExpression: string): string {
  // Parse "0 2,8,14,20 * * *" format (minute hour day month day-of-week)
  const parts = cronExpression.split(' ');
  const minute = parseInt(parts[0] || '0');
  const hoursStr = parts[1] || '0';
  const hours = hoursStr.split(',').map((h) => parseInt(h));

  const now = new Date();
  let nextRun = new Date(now);
  nextRun.setMinutes(minute);
  nextRun.setSeconds(0);
  nextRun.setMilliseconds(0);

  // Find the next hour from the cron schedule
  const currentHour = nextRun.getHours();
  const nextHour = hours.find((h) => h > currentHour);

  if (nextHour !== undefined) {
    nextRun.setHours(nextHour);
  } else {
    // Next occurrence is tomorrow
    nextRun.setDate(nextRun.getDate() + 1);
    const firstHour = hours[0] || 0;
    nextRun.setHours(firstHour);
  }

  return nextRun.toISOString();
}
