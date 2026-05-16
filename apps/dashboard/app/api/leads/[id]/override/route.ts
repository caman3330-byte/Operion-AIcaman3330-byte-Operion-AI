import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleRouteError } from "@/lib/errors";
import { leadsRepository } from "@/lib/repositories/leads";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { LeadUpdate } from "@/lib/supabase/types";
import { overrideSchema, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireFounder(request);
    const params = await context.params;
    const id = uuidSchema.parse(params.id);
    const payload = overrideSchema.parse(await request.json());
    const before = await leadsRepository.getById(id);

    await writeAuditLog({
      eventType: payload.action === "override_score" ? "score_override" : "manual_action",
      actorType: "founder",
      actorId: actor.email,
      entityType: "lead",
      entityId: id,
      beforeState: before,
      metadata: payload
    });

    const patch: LeadUpdate =
      payload.action === "override_score"
        ? {
            qualification_score: payload.score,
            tier: scoreToTier(payload.score),
            status: payload.score >= 65 ? "pending_approval" : payload.score >= 50 ? "nurture" : "archived"
          }
        : payload.action === "blacklist"
          ? {
              blacklisted: true,
              outreach_paused: true,
              status: "blacklisted"
            }
          : payload.action === "pause_outreach"
            ? { outreach_paused: true }
            : { status: "archived" };

    const updated = await leadsRepository.update(id, patch);

    if (payload.action === "blacklist") {
      const supabase = getSupabaseAdmin();
      const entries: Array<{
        type: "email" | "business_name";
        value: string;
        reason: string;
        added_by: "founder";
      }> = [{ type: "business_name", value: before.business_name, reason: payload.reason, added_by: "founder" }];

      if (before.email) {
        entries.push({ type: "email", value: before.email, reason: payload.reason, added_by: "founder" });
      }

      if (entries.length > 0) {
        await supabase.from("suppression_list").upsert(entries, { onConflict: "type,value", ignoreDuplicates: true });
      }
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

function scoreToTier(score: number) {
  if (score >= 80) {
    return "A" as const;
  }
  if (score >= 65) {
    return "B" as const;
  }
  if (score >= 50) {
    return "C" as const;
  }
  return "D" as const;
}
