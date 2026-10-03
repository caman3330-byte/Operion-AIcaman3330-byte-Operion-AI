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
  confirm_production_import: z.boolean().default(false),
  run_timeout_ms: z.number().int().min(15_000).max(55_000).optional(),
  source_timeout_ms: z.number().int().min(10_000).max(55_000).optional(),
  page_timeout_ms: z.number().int().min(3_000).max(20_000).optional(),
  detail_timeout_ms: z.number().int().min(2_000).max(15_000).optional(),
  enrichment_timeout_ms: z.number().int().min(5_000).max(30_000).optional(),
  concurrency: z.number().int().min(1).max(5).optional(),
  max_pages: z.number().int().min(1).max(10).optional(),
  use_shards: z.boolean().optional(),
  dry_run: z.boolean().optional()
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

    const scanOptions = {
      limit: payload.limit,
      sourceLimit: payload.source_limit,
      importVerified: payload.import_verified,
      requestedBy: actor.email
    };
    if (payload.run_timeout_ms !== undefined) Object.assign(scanOptions, { runTimeoutMs: payload.run_timeout_ms });
    if (payload.source_timeout_ms !== undefined) Object.assign(scanOptions, { sourceTimeoutMs: payload.source_timeout_ms });
    if (payload.page_timeout_ms !== undefined) Object.assign(scanOptions, { pageTimeoutMs: payload.page_timeout_ms });
    if (payload.detail_timeout_ms !== undefined) Object.assign(scanOptions, { detailTimeoutMs: payload.detail_timeout_ms });
    if (payload.enrichment_timeout_ms !== undefined) Object.assign(scanOptions, { enrichmentTimeoutMs: payload.enrichment_timeout_ms });
    if (payload.concurrency !== undefined) Object.assign(scanOptions, { concurrency: payload.concurrency });
    if (payload.max_pages !== undefined) Object.assign(scanOptions, { maxPages: payload.max_pages });
    if (payload.use_shards !== undefined) Object.assign(scanOptions, { useShards: payload.use_shards });
    if (payload.dry_run !== undefined) Object.assign(scanOptions, { dryRun: payload.dry_run });

    const data = await scanMerchantAcquisitionSources(scanOptions);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
