import type { Json } from "@operion/shared";
import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { recordOutreachReply } from "@/lib/outreach/sequence-engine";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { outreachReplyCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
    const replies = await acquisitionRepository.listReplies(limit);
    return NextResponse.json({ data: replies });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = outreachReplyCreateSchema.parse(await request.json());
    const input: Parameters<typeof recordOutreachReply>[0] = {
      fromEmail: payload.from_email,
      rawPayload: payload.raw_payload as Json
    };
    if (payload.subject !== undefined) input.subject = payload.subject;
    if (payload.body_text !== undefined) input.bodyText = payload.body_text;
    if (payload.body_html !== undefined) input.bodyHtml = payload.body_html;
    if (payload.provider_message_id !== undefined) input.providerMessageId = payload.provider_message_id;
    if (payload.campaign_id !== undefined) input.campaignId = payload.campaign_id;
    if (payload.lead_id !== undefined) input.leadId = payload.lead_id;
    if (payload.contact_id !== undefined) input.contactId = payload.contact_id;

    const result = await recordOutreachReply(input);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
