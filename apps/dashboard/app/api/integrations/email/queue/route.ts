import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { enqueueFundingEmail } from "@/lib/integrations/email-automation";

export const dynamic = "force-dynamic";

const emailQueueSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(240),
  text: z.string().min(1).max(8000)
});

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const payload = emailQueueSchema.parse(await request.json());
    const data = await enqueueFundingEmail(payload);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
