import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { clearTestData } from "@/lib/testing/controls";
import { clearTestDataSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireInternalUser(request);
    clearTestDataSchema.parse(await request.json());
    const result = await clearTestData(actor.email);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
