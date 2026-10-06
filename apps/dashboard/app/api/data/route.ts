import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { handleRouteError } from "@/lib/errors";
import type { DataRecord } from "@/lib/data-prospects/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireFounder(request);

    const source = request.nextUrl.searchParams.get("source") ?? "ai";
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1));
    const pageSize = Number(request.nextUrl.searchParams.get("page_size") ?? 25);
    const searchQ = request.nextUrl.searchParams.get("q") ?? "";

    const offset = (page - 1) * pageSize;
    // Use admin client with proper error handling for RLS permission issues
    const supabase = await getSupabaseAdmin();

    let query = (supabase.from("data_prospect_records" as any).select("*", { count: "exact" }));

    if (source === "manual") {
      query = query.eq("source", "manual");
    } else {
      query = query.eq("source", "ai").not("provider", "eq", "deleted_test_discovery");
    }

    if (searchQ) {
      query = query.or(
        `business_name.ilike.%${searchQ}%,address.ilike.%${searchQ}%,email.ilike.%${searchQ}%,phone.ilike.%${searchQ}%`
      );
    }

    const { data, count, error } = await (query
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1) as any);

    if (error) throw new Error(error.message);

    const total = count ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    // Get real statistics from database
    let stats = { verified: 0, invalid: 0 };
    try {
      // Count prospects with verified_at timestamp set
      const verifiedQuery = source === "manual"
        ? supabase.from("acquisition_prospects").select("id", { count: "exact", head: true }).eq("source_kind", "manual").not("verified_at", "is", null)
        : supabase.from("acquisition_prospects").select("id", { count: "exact", head: true }).eq("source_kind", "ai").not("verified_at", "is", null);

      const { count: verifiedCount } = await verifiedQuery as any;

      // Count prospects with invalid/failed enrichment
      const invalidQuery = source === "manual"
        ? supabase.from("acquisition_prospects").select("id", { count: "exact", head: true }).eq("source_kind", "manual").eq("enrichment_status", "failed")
        : supabase.from("acquisition_prospects").select("id", { count: "exact", head: true }).eq("source_kind", "ai").eq("enrichment_status", "failed");

      const { count: invalidCount } = await invalidQuery as any;

      stats = {
        verified: verifiedCount ?? 0,
        invalid: invalidCount ?? 0,
      };
    } catch (statsError) {
      // Silently fail stats calculation, return defaults
      console.warn("Error calculating statistics:", statsError);
    }

    return NextResponse.json({
      data: (data ?? []) as DataRecord[],
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
      },
      stats,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
