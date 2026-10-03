import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { readServerEnv } from "@/lib/env";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface ProviderStatus {
  key: string;
  label: string;
  configured: boolean;
}

export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);
    const env = readServerEnv();

    const providers: ProviderStatus[] = [
      {
        key: "google_places",
        label: "Google Places",
        configured: Boolean(env.GOOGLE_PLACES_API_KEY?.trim())
      },
      {
        key: "apollo",
        label: "Apollo",
        configured: Boolean(env.APOLLO_API_KEY?.trim())
      }
    ];

    return NextResponse.json({ providers });
  } catch (error) {
    return handleRouteError(error);
  }
}
