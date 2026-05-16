import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { qualifyApplicationWithOpenAi } from "@/lib/integrations/openai";

export const dynamic = "force-dynamic";

const openAiQualificationSchema = z.object({
  businessName: z.string().min(2).max(180),
  industry: z.string().min(2).max(120),
  requestedAmount: z.coerce.number().positive(),
  monthlyDeposits: z.coerce.number().nonnegative(),
  creditScoreRange: z.enum(["under_550", "550_599", "600_649", "650_699", "700_plus", "unknown"])
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = openAiQualificationSchema.parse(await request.json());
    const data = await qualifyApplicationWithOpenAi(payload);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
