import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { testMerchantSource } from "@/lib/acquisition/merchant-intelligence";
import { scanMerchantAcquisitionSourceById } from "@/lib/acquisition/merchant-source-scanner";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  source_id: z.string().uuid(),
  limit: z.number().int().min(1).max(10).default(10),
  source_timeout_ms: z.number().int().min(10_000).max(55_000).optional(),
  page_timeout_ms: z.number().int().min(3_000).max(20_000).optional(),
  detail_timeout_ms: z.number().int().min(2_000).max(15_000).optional(),
  max_pages: z.number().int().min(1).max(10).optional(),
  persist_candidates: z.boolean().default(false),
  concurrency: z.number().int().min(1).max(5).optional(),
  use_shards: z.boolean().optional()
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = requestSchema.parse(await request.json());
    const options: Parameters<typeof testMerchantSource>[2] = {};
    if (payload.source_timeout_ms !== undefined) options.sourceTimeoutMs = payload.source_timeout_ms;
    if (payload.page_timeout_ms !== undefined) options.pageTimeoutMs = payload.page_timeout_ms;
    if (payload.detail_timeout_ms !== undefined) options.detailTimeoutMs = payload.detail_timeout_ms;
    if (payload.max_pages !== undefined) options.maxPages = payload.max_pages;
    if (payload.persist_candidates) {
      const scanOptions: Parameters<typeof scanMerchantAcquisitionSourceById>[1] = {
        limit: payload.limit,
        sourceLimit: 1,
        importVerified: false,
        persistCandidates: true,
        requestedBy: "founder_controlled_source_test"
      };
      if (payload.source_timeout_ms !== undefined) scanOptions.sourceTimeoutMs = payload.source_timeout_ms;
      if (payload.page_timeout_ms !== undefined) scanOptions.pageTimeoutMs = payload.page_timeout_ms;
      if (payload.detail_timeout_ms !== undefined) scanOptions.detailTimeoutMs = payload.detail_timeout_ms;
      if (payload.concurrency !== undefined) scanOptions.concurrency = payload.concurrency;
      if (payload.max_pages !== undefined) scanOptions.maxPages = payload.max_pages;
      if (payload.use_shards !== undefined) scanOptions.useShards = payload.use_shards;
      return NextResponse.json({
        data: await scanMerchantAcquisitionSourceById(payload.source_id, scanOptions),
        imported: false,
        outreach: false
      });
    }
    const data = await testMerchantSource(payload.source_id, payload.limit, options);
    return NextResponse.json({ data, imported: false, outreach: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
