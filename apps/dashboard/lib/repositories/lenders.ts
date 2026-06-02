import { NotFoundError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { LenderInsert, LenderUpdate } from "@/lib/supabase/types";

export const lendersRepository = {
  async list(activeOnly = false) {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("lenders")
      .select("*")
      .neq("approval_status", "archived")
      .neq("lender_status", "suspended")
      .order("created_at", { ascending: false });

    if (activeOnly) {
      query = query.eq("active", true).eq("approval_status", "approved").eq("lender_status", "active");
    } else {
      query = query.neq("active", false);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return data ?? [];
  },

  async getById(id: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("lenders").select("*").eq("id", id).single();
    if (error || !data) {
      throw new NotFoundError("Lender not found");
    }

    return data;
  },

  async create(payload: LenderInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("lenders").insert(payload).select("*").single();
    if (error) {
      throw error;
    }

    return data;
  },

  async update(id: string, payload: LenderUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("lenders").update(payload).eq("id", id).select("*").single();
    if (error || !data) {
      throw error ?? new NotFoundError("Lender not found");
    }

    return data;
  }
};
