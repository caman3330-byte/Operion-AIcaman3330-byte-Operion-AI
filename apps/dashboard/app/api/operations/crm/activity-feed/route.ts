import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { listActivityFeed } from "@/lib/crm/lifecycle";
import { handleRouteError } from "@/lib/errors";
import { crmActivityFeedSchema } from "@/lib/operations/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const query = crmActivityFeedSchema.parse({
      applicationId: request.nextUrl.searchParams.get("applicationId"),
      limit: request.nextUrl.searchParams.get("limit") ?? undefined
    });
    const result = await listActivityFeed(query.applicationId, query.limit);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
