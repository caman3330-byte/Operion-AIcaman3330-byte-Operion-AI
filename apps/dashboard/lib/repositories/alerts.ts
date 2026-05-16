import { NotFoundError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AlertInsert } from "@/lib/supabase/types";

export const alertsRepository = {
  async listUnresolved(limit = 50) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .eq("resolved", false)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data ?? [];
  },

  async create(payload: AlertInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("alerts").insert(payload).select("*").single();
    if (error) {
      throw error;
    }

    return data;
  },

  async resolve(id: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("alerts")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      throw error ?? new NotFoundError("Alert not found");
    }

    return data;
  }
};
