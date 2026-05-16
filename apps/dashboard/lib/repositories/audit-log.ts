import type { EntityType } from "@operion/shared";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AuditLogInsert } from "@/lib/supabase/types";

export interface AuditFilters {
  eventType?: string | undefined;
  entityType?: EntityType | undefined;
  limit?: number | undefined;
}

export const auditLogRepository = {
  async list(filters: AuditFilters = {}) {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(filters.limit ?? 500);

    if (filters.eventType) {
      query = query.eq("event_type", filters.eventType);
    }

    if (filters.entityType) {
      query = query.eq("entity_type", filters.entityType);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return data ?? [];
  },

  async create(payload: AuditLogInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("audit_log").insert(payload).select("*").single();
    if (error) {
      throw error;
    }

    return data;
  }
};
