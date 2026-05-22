import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { getOperationalDiagnostics } from "@/lib/observability/events";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireInternalUser(request);
    return NextResponse.json({ data: await getOperationalDiagnostics() });
  } catch (error) {
    return handleRouteError(error);
  }
}
