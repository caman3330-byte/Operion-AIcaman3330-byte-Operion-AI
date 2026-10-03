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

    return NextResponse.json({
      data: (data ?? []) as DataRecord[],
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
