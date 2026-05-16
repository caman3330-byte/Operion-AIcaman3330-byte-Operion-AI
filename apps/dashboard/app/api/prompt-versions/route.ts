import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { promptVersionsRepository } from "@/lib/repositories/prompt-versions";
import { promptVersionCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const data = await promptVersionsRepository.list();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = promptVersionCreateSchema.parse(await request.json());

    await writeAuditLog({
      eventType: "manual_action",
      actorType: "founder",
      actorId: actor.email,
      entityType: "prompt",
      metadata: { action: "create_prompt_version", label: payload.label }
    });

    const data = await promptVersionsRepository.create({
      ...payload,
      active: false,
      created_by: actor.email
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
