import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { syncToCrm } from "@/lib/integrations/crm-sync";

export const dynamic = "force-dynamic";

const crmSyncSchema = z.object({
  entityType: z.enum(["application", "lead", "business"]),
  entityId: z.string().uuid(),
  payload: z.record(z.unknown()).default({})
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = crmSyncSchema.parse(await request.json());
    const data = await syncToCrm({
      entityType: payload.entityType,
      entityId: payload.entityId,
      payload: payload.payload as Json
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
