import { getConfigurationStatus } from "@/lib/env";
import { startRouteTiming, timedJson } from "@/lib/runtime/route-timing";

export const dynamic = "force-dynamic";

export async function GET() {
  const timing = startRouteTiming();
  const configuration = getConfigurationStatus();
  const coreReady =
    configuration.supabase &&
    configuration.auth &&
    configuration.sendgrid &&
    (configuration.openai || configuration.anthropic);

  return timedJson({
    status: coreReady ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      database: configuration.supabase ? "configured" : "not_configured",
      auth: configuration.auth ? "configured" : "not_configured",
      ai: configuration.openai || configuration.anthropic ? "configured" : "not_configured",
      sendgrid: configuration.sendgrid ? "configured" : "not_configured"
    }
  }, timing);
}
