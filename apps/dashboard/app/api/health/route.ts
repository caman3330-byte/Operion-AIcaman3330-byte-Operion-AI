import { NextResponse } from "next/server";
import { getConfigurationStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const configuration = getConfigurationStatus();
  const coreReady =
    configuration.supabase &&
    configuration.auth &&
    configuration.sendgrid &&
    (configuration.openai || configuration.anthropic);

  return NextResponse.json({
    status: coreReady ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      database: configuration.supabase ? "configured" : "not_configured",
      auth: configuration.auth ? "configured" : "not_configured",
      ai: configuration.openai || configuration.anthropic ? "configured" : "not_configured",
      sendgrid: configuration.sendgrid ? "configured" : "not_configured"
    }
  });
}
