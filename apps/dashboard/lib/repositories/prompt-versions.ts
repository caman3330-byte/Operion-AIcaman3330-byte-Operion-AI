import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { PromptTestResultInsert, PromptVersionInsert } from "@/lib/supabase/types";

export const promptVersionsRepository = {
  async list() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("prompt_versions").select("*").order("version_number", { ascending: false });
    if (error) {
      throw error;
    }

    return data ?? [];
  },

  async getActive() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("prompt_versions").select("*").eq("active", true).single();
    if (error) {
      throw error;
    }

    return data;
  },

  async create(payload: PromptVersionInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("prompt_versions").insert({ ...payload, active: false }).select("*").single();
    if (error) {
      throw error;
    }

    return data;
  },

  async activate(id: string, actor: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("activate_prompt_version", {
      target_prompt_version_id: id,
      actor
    });

    if (error) {
      throw error;
    }

    return data;
  },

  async createTestResult(payload: PromptTestResultInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("prompt_test_results").insert(payload).select("*").single();
    if (error) {
      throw error;
    }

    return data;
  },

  async listTestResults(limit = 100) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("prompt_test_results")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data ?? [];
  }
};
