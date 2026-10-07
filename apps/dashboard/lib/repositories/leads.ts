import type { Lead, LeadStatus, LeadTier, PaginatedResult } from "@operion/shared";
import { NotFoundError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { LeadInsert, LeadUpdate } from "@/lib/supabase/types";

export interface LeadFilters {
  page?: number | undefined;
  pageSize?: number | undefined;
  status?: LeadStatus | undefined;
  tier?: LeadTier | undefined;
  search?: string | undefined;
  sortBy?: "created_at" | "business_name" | "status" | undefined;
  sortOrder?: "asc" | "desc" | undefined;
}

export const leadsRepository = {
  async list(filters: LeadFilters = {}): Promise<PaginatedResult<Lead>> {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const supabase = getSupabaseAdmin();

    const sortBy = filters.sortBy ?? "created_at";
    const sortOrder = filters.sortOrder ?? "desc";

    let query = supabase.from("leads").select("*", { count: "exact" }).order(sortBy, { ascending: sortOrder === "asc" });

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    if (filters.tier) {
      query = query.eq("tier", filters.tier);
    }

    if (filters.search) {
      query = query.or(`business_name.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,city.ilike.%${filters.search}%,state.ilike.%${filters.search}%`);
    }

    const { data, count, error } = await query.range(from, to);
    if (error) {
      throw error;
    }

    return {
      data: data ?? [],
      page,
      pageSize,
      total: count ?? 0
    };
  },

  async getById(id: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("leads").select("*").eq("id", id).single();
    if (error || !data) {
      throw new NotFoundError("Lead not found");
    }

    return data;
  },

  async getDetail(id: string) {
    const supabase = getSupabaseAdmin();
    const [lead, outreach, distributions] = await Promise.all([
      this.getById(id),
      supabase.from("outreach_history").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      supabase.from("lead_distributions").select("*").eq("lead_id", id).order("created_at", { ascending: false })
    ]);

    if (outreach.error) {
      throw outreach.error;
    }

    if (distributions.error) {
      throw distributions.error;
    }

    return {
      lead,
      outreach_history: outreach.data ?? [],
      distributions: distributions.data ?? []
    };
  },

  async create(payload: LeadInsert) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("leads").insert(payload).select("*").single();
    if (error) {
      throw error;
    }

    return data;
  },

  async update(id: string, payload: LeadUpdate) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("leads").update(payload).eq("id", id).select("*").single();
    if (error || !data) {
      throw error ?? new NotFoundError("Lead not found");
    }

    return data;
  },

  async getEmailOutreachReadyLeads(filters: LeadFilters = {}): Promise<PaginatedResult<Lead>> {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .not("email", "is", null)
      .eq("status", "raw")
      .is("blacklisted", null)
      .is("email_verified", null) // not yet verified but available
      .order("created_at", { ascending: false });

    if (filters.search) {
      query = query.or(`business_name.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,city.ilike.%${filters.search}%,state.ilike.%${filters.search}%`);
    }

    const { data, count, error } = await query.range(from, to);
    if (error) {
      throw error;
    }

    return {
      data: data ?? [],
      page,
      pageSize,
      total: count ?? 0
    };
  }
};
