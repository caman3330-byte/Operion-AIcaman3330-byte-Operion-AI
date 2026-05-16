import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError } from "@/lib/errors";
import { listAcquisitionProviders, setProviderEnabled } from "@/lib/acquisition/providers";
import { providerUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const providers = await listAcquisitionProviders();
    return NextResponse.json({ data: providers });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireFounder(request);
    const payload = providerUpdateSchema.parse(await request.json());
    const result = await setProviderEnabled(payload.provider_key, payload.enabled, actor.email);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
