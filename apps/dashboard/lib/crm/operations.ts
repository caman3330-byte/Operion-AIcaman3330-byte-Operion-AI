import { getSupabaseAdmin } from '../supabase/server';
import { logger } from '../logger';
import type { CrmActivityType, Json } from '@operion/shared';

export interface DealStageUpdate {
  applicationId: string;
  stage: string;
  notes?: string;
  updatedBy: string;
}

export async function updateDealStage(input: DealStageUpdate): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();
    const rawSupabase = supabase as unknown as { from: (table: string) => any };

    const { data: existing, error: fetchError } = await rawSupabase
      .from('funding_pipeline')
      .select('id')
      .eq('business_application_id', input.applicationId)
      .maybeSingle();

    if (fetchError) {
      logger.error('Failed to fetch existing funding pipeline row', { error: fetchError.message });
      return { success: false, error: fetchError.message };
    }

    const payload = {
      business_application_id: input.applicationId,
      stage: input.stage,
      notes: input.notes,
      metadata: { updatedBy: input.updatedBy } as Json,
      updated_at: new Date().toISOString(),
    };

    const query = existing
      ? rawSupabase.from('funding_pipeline').update(payload).eq('id', (existing as { id: string }).id)
      : rawSupabase.from('funding_pipeline').insert(payload);

    const { error } = await query.select();

    if (error) {
      logger.error('Failed to update deal stage', { error: error.message });
      return { success: false, error: error.message };
    }

    logger.info('Deal stage updated', { applicationId: input.applicationId, stage: input.stage, updatedBy: input.updatedBy });
    return { success: true };
  } catch (error) {
    logger.error('Exception updating deal stage', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Internal error' };
  }
}

export async function trackCRMActivity(input: {
  applicationId: string;
  businessId?: string | null;
  actorId: string;
  actorType: string;
  activityType: CrmActivityType;
  subject: string;
  body?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();
    const applicationTarget = await resolveApplicationTarget(input.applicationId);
    const { error } = await supabase.from('crm_activities').insert({
      application_id: applicationTarget.legacyApplicationId,
      business_application_id: applicationTarget.businessApplicationId,
      business_id: input.businessId ?? null,
      actor_id: input.actorId,
      actor_type: input.actorType,
      activity_type: input.activityType,
      subject: input.subject,
      body: input.body,
      metadata: (input.metadata || {}) as Json,
    });

    if (error) {
      logger.error('Failed to track CRM activity', { error: error.message });
      return { success: false, error: error.message };
    }

    logger.info('CRM activity tracked', {
      applicationId: input.applicationId,
      activityType: input.activityType,
    });

    return { success: true };
  } catch (error) {
    logger.error('Exception tracking CRM activity', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Internal error' };
  }
}

export async function detectStaleLead(applicationId: string, staleThresholdHours: number = 72): Promise<boolean> {
  try {
    const supabase = await getSupabaseAdmin();
    const { data, error } = await supabase
      .from('crm_activities')
      .select('created_at')
      .or(`application_id.eq.${applicationId},business_application_id.eq.${applicationId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      logger.error('Failed to detect stale lead', { error: error.message });
      return false;
    }

    if (!data) return true;

    const lastActivity = new Date(data.created_at).getTime();
    const ageHours = (Date.now() - lastActivity) / (1000 * 60 * 60);
    return ageHours > staleThresholdHours;
  } catch (error) {
    logger.error('Exception detecting stale lead', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function resolveApplicationTarget(applicationId: string) {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from('business_applications')
    .select('id')
    .eq('id', applicationId)
    .maybeSingle();

  if (!error && data?.id) {
    return {
      businessApplicationId: applicationId,
      legacyApplicationId: null
    };
  }

  return {
    businessApplicationId: null,
    legacyApplicationId: applicationId
  };
}
