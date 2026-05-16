import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { promptVersionsRepository } from "@/lib/repositories/prompt-versions";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireFounder(request);
    const params = await context.params;
    const id = uuidSchema.parse(params.id);
    const data = await promptVersionsRepository.activate(id, actor.email);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
