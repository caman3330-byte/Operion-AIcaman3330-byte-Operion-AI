import { NextRequest, NextResponse } from "next/server";
import { buildAutonomousCommandCenterSnapshot } from "@/lib/autonomous-company/command-center";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const snapshot = await buildAutonomousCommandCenterSnapshot();
    return NextResponse.json({ data: snapshot });
  } catch (error) {
    return handleRouteError(error);
  }
}
