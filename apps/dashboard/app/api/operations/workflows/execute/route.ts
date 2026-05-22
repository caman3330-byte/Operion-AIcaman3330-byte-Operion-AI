import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { workflowExecutionSchema } from "@/lib/operations/schemas";
import { createWorkflowJob, getWorkflowJob, moveToDeadLetter, retryJob, updateJobStatus } from "@/lib/workflows/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const payload = workflowExecutionSchema.parse(await readJsonBody(request));

    if (payload.action === "create") {
      if (!payload.workflowKey || !payload.jobType) throw new ValidationError("workflowKey and jobType are required for create");
      const result = await createWorkflowJob({
        workflowKey: payload.workflowKey,
        jobType: payload.jobType,
        payload: payload.payload ?? {},
        ...(payload.priority !== undefined ? { priority: payload.priority } : {})
      });
      return NextResponse.json({ data: result }, { status: result.success ? 201 : 400 });
    }

    if (!payload.jobId) throw new ValidationError("jobId is required for this workflow action");

    if (payload.action === "fetch") {
      return NextResponse.json({ data: await getWorkflowJob(payload.jobId) });
    }

    if (payload.action === "retry") {
      return NextResponse.json({ data: await retryJob(payload.jobId) });
    }

    if (payload.action === "dead_letter") {
      return NextResponse.json({ data: await moveToDeadLetter(payload.jobId, payload.errorMessage ?? "Moved to dead letter by operator") });
    }

    if (!payload.status) throw new ValidationError("status is required for update");
    const result = await updateJobStatus(payload.jobId, payload.status, {
      ...(payload.result ? { result: payload.result } : {}),
      ...(payload.errorMessage ? { errorMessage: payload.errorMessage } : {})
    });
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
