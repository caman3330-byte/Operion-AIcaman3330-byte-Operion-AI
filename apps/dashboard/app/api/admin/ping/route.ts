import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/errors";
import { requireInternalUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await requireInternalUser(request);
    return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (error) {
    return handleRouteError(error);
  }
}
