import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { orchestrationRepository } from "@/lib/repositories/orchestration";

export const dynamic = "force-dynamic";

const createMessageSchema = z.object({
  task_id: z.string().uuid().optional().nullable(),
  from_agent_key: z.string().min(1),
  to_agent_key: z.string().min(1),
  message_type: z.enum(["handoff", "status_update", "question", "answer", "escalation", "summary"]),
  subject: z.string().min(1),
  body: z.string().min(1),
  context: z.unknown().optional().nullable()
});

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const taskId = request.nextUrl.searchParams.get("taskId") ?? undefined;
    const messages = await orchestrationRepository.listMessages(taskId);

    return NextResponse.json({ data: messages });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = createMessageSchema.parse(await request.json());
    const message = await orchestrationRepository.createMessage({
      ...payload,
      context: (payload.context ?? null) as Json | null
    });

    return NextResponse.json({ data: message }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
