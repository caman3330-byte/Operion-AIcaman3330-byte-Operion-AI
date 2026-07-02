import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().trim().max(1000).optional()
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireFounder(request);
    const { id } = await context.params;
    const payload = requestSchema.parse(await request.json().catch(() => ({})));
    const data = await acquisitionRepository.updateMerchantCandidate(id, {
      import_review_status: payload.decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor.email,
      review_notes: payload.notes ?? null
    });
    return NextResponse.json({ data, imported: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
