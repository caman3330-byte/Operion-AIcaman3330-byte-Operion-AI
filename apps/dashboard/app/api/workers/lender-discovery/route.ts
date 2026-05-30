import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { runLenderDiscoveryWorker } from "@/lib/workers/lender-discovery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const tickSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20)
});

export async function POST(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const payload = tickSchema.parse(await request.json().catch(() => ({})));
    const result = await runLenderDiscoveryWorker(payload.limit);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
