import type { Json } from "@operion/shared";
import { ConfigurationError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  AiQualificationLogInsert,
  BusinessInsert,
  FundingApplicationInsert,
  FundingApplicationUpdate,
  PublicUserInsert
} from "@/lib/supabase/types";

const PHASE1_MIGRATION = "packages/database/migrations/0006_phase1_public_mvp.sql";

export const applicationsRepository = {
  async ensurePhase1Schema() {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("applications").select("id").limit(1);
    if (error) throwPhase1DatabaseError(error);
  },

  async upsertUser(payload: PublicUserInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("users").upsert(payload, { onConflict: "id" }).select("*").single();
    if (error) throwPhase1DatabaseError(error);
    return data;
  },

  async createBusiness(payload: BusinessInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("businesses").insert(payload).select("*").single();
    if (error) throwPhase1DatabaseError(error);
    return data;
  },

  async createApplication(payload: FundingApplicationInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("applications").insert(payload).select("*").single();
    if (error) throwPhase1DatabaseError(error);
    return data;
  },

  async updateApplication(id: string, payload: FundingApplicationUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("applications").update(payload).eq("id", id).select("*").single();
    if (error) throwPhase1DatabaseError(error);
    return data;
  },

  async listApplications(limit = 100) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwPhase1DatabaseError(error);
    return data ?? [];
  },

  async createAiQualificationLog(payload: AiQualificationLogInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("ai_qualification_logs").insert(payload).select("*").single();
    if (error) throwPhase1DatabaseError(error);
    return data;
  }
};

export function isPhase1MigrationMissing(error: unknown) {
  return error instanceof ConfigurationError && error.message.includes("0006");
}

function throwPhase1DatabaseError(error: { code?: string; message?: string }): never {
  const message = error.message ?? "";
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    ["users", "businesses", "applications", "ai_qualification_logs"].some((table) => message.includes(table))
  ) {
    throw new ConfigurationError("Phase 1 public MVP migration 0006 has not been applied to Supabase", {
      migration: PHASE1_MIGRATION,
      prerequisite: "packages/database/migrations/0001_mvp_v1.sql"
    });
  }

  throw error;
}

export function applicationMetadata(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}
