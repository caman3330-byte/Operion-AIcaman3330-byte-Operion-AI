import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { getAiExecutionReviewFeed } from "@/lib/operations/operator-services";
import { operatorQueueSchema } from "@/lib/operations/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const query = operatorQueueSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json({ data: await getAiExecutionReviewFeed(query) });
  } catch (error) {
    return handleRouteError(error);
  }
}
