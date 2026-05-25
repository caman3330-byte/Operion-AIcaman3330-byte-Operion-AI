import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { saveOperatorNotes } from "@/lib/operations/operator-notes";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const notesSchema = z.object({
  applicationId: uuidSchema,
  internal: z.string().max(4000).optional().default(""),
  underwriting: z.string().max(4000).optional().default(""),
  lender: z.string().max(4000).optional().default(""),
  funding: z.string().max(4000).optional().default("")
});

export async function PATCH(request: NextRequest) {
  try {
    enforceRateLimit({ key: rateLimitKey(request, "operations_application_notes"), limit: 60, windowMs: 60_000 });
    const actor = await requireInternalUser(request);
    const { applicationId, ...notes } = notesSchema.parse(await readJsonBody(request));
    return NextResponse.json({ data: await saveOperatorNotes({ applicationId, actor, notes }) });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Invalid JSON request body");
  }
}
