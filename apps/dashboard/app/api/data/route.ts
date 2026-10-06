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
    const sortBy = request.nextUrl.searchParams.get("sort") ?? "newest";
    const sortDir = request.nextUrl.searchParams.get("sort_dir") ?? "desc";

    const offset = (page - 1) * pageSize;
    const supabase = await getSupabaseAdmin();

    // NOTE: data_prospect_records is a view created by migration 0041+
    // but is not in generated Supabase types; cast result as any
    const table = (supabase as any).from("data_prospect_records");
    let query = table.select("*", { count: "exact" });

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

    // Apply sorting
    const isAsc = sortDir === "asc";
    switch (sortBy) {
      case "oldest":
        query = query.order("created_at", { ascending: true });
        break;
      case "name":
        query = query.order("business_name", { ascending: isAsc });
        break;
      case "status":
        query = query.order("enrichment_status", { ascending: isAsc });
        break;
      case "newest":
      default:
        query = query.order("created_at", { ascending: false });
        break;
    }

    const { data, count, error } = await (query
      .range(offset, offset + pageSize - 1) as any);

    if (error) throw new Error(error.message);

    const total = count ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    // Calculate real statistics from acquisition_prospects
    const statsTable = (supabase as any).from("acquisition_prospects");
    let statsQuery = statsTable.select("enrichment_status, verified_at", { count: "exact" });

    if (source === "manual") {
      statsQuery = statsQuery.eq("source", "manual");
    } else {
      statsQuery = statsQuery.eq("source", "ai").not("provider", "eq", "deleted_test_discovery");
    }

    const { data: statsData, error: statsError } = await statsQuery;

    // Statistics reflect enrichment progress, not business judgments
    // enriched: prospects with enrichment_status='enriched' (success)
    // pending: prospects with enrichment_status='pending' (awaiting enrichment)
    let enriched = 0;
    let pending = 0;
    if (!statsError && statsData) {
      enriched = statsData.filter((row: any) => row.enrichment_status === "enriched").length;
      pending = statsData.filter((row: any) => row.enrichment_status === "pending").length;
    }

    return NextResponse.json({
      data: (data ?? []) as DataRecord[],
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
      },
      stats: { enriched, pending },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
