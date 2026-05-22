import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { getOperationsAnalyticsSnapshot } from "@/lib/analytics/service";
import { createDailyOperationsSnapshot } from "@/lib/analytics/snapshots";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { analyticsSnapshotSchema } from "@/lib/operations/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const query = analyticsSnapshotSchema.parse({
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
      persist: request.nextUrl.searchParams.get("persist") === "true"
    });
    const window = query.from && query.to ? { from: query.from, to: query.to } : undefined;
    const result = query.persist
      ? await createDailyOperationsSnapshot(window)
      : await getOperationsAnalyticsSnapshot(window);

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const payload = analyticsSnapshotSchema.parse(await readJsonBody(request));
    const window = payload.from && payload.to ? { from: payload.from, to: payload.to } : undefined;
    const result = payload.persist
      ? await createDailyOperationsSnapshot(window)
      : await getOperationsAnalyticsSnapshot(window);
    return NextResponse.json({ data: result });
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
