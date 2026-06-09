import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScheduler } from "@/lib/auth";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { scanMerchantAcquisitionSources } from "@/lib/acquisition/merchant-source-scanner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const scanSchema = z.object({
  limit: z.number().int().min(1).max(50).default(25),
  source_limit: z.number().int().min(1).max(25).default(5),
  import_verified: z.boolean().default(false),
  confirm_production_import: z.boolean().default(false)
});

export async function GET(request: NextRequest) {
  return runScan(request, {});
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return runScan(request, body);
}

async function runScan(request: NextRequest, body: unknown) {
  try {
    const actor = await requireScheduler(request);
    const payload = scanSchema.parse(body);
    if (payload.import_verified && !payload.confirm_production_import) {
      throw new ValidationError("Verified lead import requires confirm_production_import=true");
    }

    const data = await scanMerchantAcquisitionSources({
      limit: payload.limit,
      sourceLimit: payload.source_limit,
      importVerified: payload.import_verified,
      requestedBy: actor.email
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
