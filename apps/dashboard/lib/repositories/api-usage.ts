import type { ApiService } from "@operion/shared";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { ApiUsageLogInsert } from "@/lib/supabase/types";

export const apiUsageRepository = {
  async create(payload: ApiUsageLogInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("api_usage_log").insert(payload).select("*").single();
    if (error) {
      throw error;
    }

    return data;
  },

  async summary(days = 30) {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase.from("api_usage_log").select("*").gte("created_at", since);

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    const byService = rows.reduce<Record<ApiService, number>>(
      (acc, row) => {
        acc[row.service] += Number(row.estimated_cost_usd ?? 0);
        return acc;
      },
      { anthropic: 0, openai: 0, apollo: 0, sendgrid: 0, stripe: 0 }
    );

    return {
      days,
      total_cost_usd: rows.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0),
      successful_calls: rows.filter((row) => row.success).length,
      failed_calls: rows.filter((row) => row.success === false).length,
      by_service: byService
    };
  }
};
