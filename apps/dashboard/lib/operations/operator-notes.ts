import { productionRepository } from "@/lib/repositories/production";
import type { FounderActor } from "@/lib/auth";
import type { Json } from "@/lib/supabase/types";

export type OperatorNotesPayload = {
  internal: string;
  underwriting: string;
  lender: string;
  funding: string;
};

export async function saveOperatorNotes({
  applicationId,
  actor,
  notes
}: {
  applicationId: string;
  actor: FounderActor;
  notes: OperatorNotesPayload;
}) {
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

  return { application: updatedApplication, notes: updatedNotes };
}

function summarizeChangedNotes(previousNotes: Record<string, unknown>, updatedNotes: Record<string, string>) {
  const changed = ["internal", "underwriting", "lender", "funding"].filter((key) => String(previousNotes[key] ?? "") !== updatedNotes[key]);
  return changed.length === 0 ? "Operator notes saved with no text changes." : `Updated ${changed.join(", ")} notes.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
