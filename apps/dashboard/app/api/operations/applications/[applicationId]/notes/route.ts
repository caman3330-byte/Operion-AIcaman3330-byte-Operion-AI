import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { productionRepository } from "@/lib/repositories/production";
import { uuidSchema } from "@/lib/validation";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const routeParamsSchema = z.object({
  applicationId: uuidSchema
});

const notesSchema = z.object({
  internal: z.string().max(4000).optional().default(""),
  underwriting: z.string().max(4000).optional().default(""),
  lender: z.string().max(4000).optional().default(""),
  funding: z.string().max(4000).optional().default("")
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ applicationId: string }> }) {
  try {
    enforceRateLimit({ key: rateLimitKey(request, "operations_application_notes"), limit: 60, windowMs: 60_000 });
    const actor = await requireInternalUser(request);
    const { applicationId } = routeParamsSchema.parse(await context.params);
    const notes = notesSchema.parse(await readJsonBody(request));
    const application = await productionRepository.getBusinessApplication(applicationId);
    const metadata = isRecord(application.metadata) ? application.metadata : {};
    const previousNotes = isRecord(metadata.operator_notes) ? metadata.operator_notes : {};
    const updatedNotes = {
      internal: notes.internal.trim(),
      underwriting: notes.underwriting.trim(),
      lender: notes.lender.trim(),
      funding: notes.funding.trim(),
      updated_at: new Date().toISOString(),
      updated_by: actor.email
    };
    const nextMetadata = {
      ...metadata,
      internal_notes: updatedNotes.internal,
      operator_notes: updatedNotes
    };

    const updatedApplication = await productionRepository.updateBusinessApplication(applicationId, {
      metadata: nextMetadata as Json
    });

    await productionRepository.createCrmActivity({
      business_application_id: applicationId,
      actor_id: actor.id,
      actor_type: actor.role,
      activity_type: "note",
      subject: "Operator notes updated",
      body: summarizeChangedNotes(previousNotes, updatedNotes),
      metadata: {
        source: "operator_notes_form",
        fields: ["internal", "underwriting", "lender", "funding"]
      }
    });

    await productionRepository.createAuditLog({
      event_type: "operator_notes_updated",
      actor_id: actor.id,
      actor_role: actor.role,
      entity_type: "business_application",
      entity_id: applicationId,
      before_state: { operator_notes: previousNotes } as Json,
      after_state: { operator_notes: updatedNotes } as Json,
      metadata: {
        source: "operator_notes_form",
        actor_email: actor.email
      }
    });

    return NextResponse.json({ data: { application: updatedApplication, notes: updatedNotes } });
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

function summarizeChangedNotes(previousNotes: Record<string, unknown>, updatedNotes: Record<string, string>) {
  const changed = ["internal", "underwriting", "lender", "funding"].filter((key) => String(previousNotes[key] ?? "") !== updatedNotes[key]);
  return changed.length === 0 ? "Operator notes saved with no text changes." : `Updated ${changed.join(", ")} notes.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
