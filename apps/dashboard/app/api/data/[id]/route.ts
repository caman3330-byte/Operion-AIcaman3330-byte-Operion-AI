import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { getDataDetail } from "@/lib/data-prospects/repository";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireFounder(request);

    const { id } = await context.params;
    const parsedId = z.string().uuid().parse(id);
    const kind = z.enum(["prospect", "candidate"]).parse(request.nextUrl.searchParams.get("kind") ?? "prospect");

    const data = await getDataDetail(parsedId, kind);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
