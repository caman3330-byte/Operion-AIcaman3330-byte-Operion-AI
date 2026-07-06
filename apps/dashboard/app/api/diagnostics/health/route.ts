import { NextRequest } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { collectDiagnosticsSnapshot } from "@/lib/diagnostics/summary";
import { getConfigurationStatus } from "@/lib/env";
import { handleRouteError } from "@/lib/errors";
import { startRouteTiming, timedJson } from "@/lib/runtime/route-timing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const timing = startRouteTiming();
  try {
    await requireInternalUser(request);
    const [configuration, diagnostics] = await Promise.all([
      Promise.resolve(getConfigurationStatus()),
      collectDiagnosticsSnapshot()
    ]);

    return timedJson({
      status: diagnostics.health_status,
      timestamp: new Date().toISOString(),
      services: {
        database: configuration.supabase ? "configured" : "not_configured",
        auth: configuration.auth ? "configured" : "not_configured",
        anthropic: configuration.anthropic ? "configured" : "not_configured",
        openai: configuration.openai ? "configured" : "not_configured",
        sendgrid: configuration.sendgrid ? "configured" : "not_configured",
        crm: configuration.crm ? "configured" : "not_configured",
        stripe: configuration.stripe ? "configured" : "not_configured",
        apollo: configuration.apollo ? "configured" : "not_configured",
        google: configuration.google ? "configured" : "not_configured",
        cloudflare: configuration.cloudflare ? "configured" : "not_configured",
        zoho: configuration.zoho ? "configured" : "not_configured",
        acquisitionScheduler: configuration.acquisitionScheduler ? "enabled" : "disabled",
        merchantIntelligenceScheduler: configuration.merchantIntelligenceScheduler ? "enabled" : "disabled",
        internalApi: configuration.internalApi ? "configured" : "not_configured",
        slack: configuration.slack ? "configured" : "not_configured",
        n8n: configuration.n8n ? "configured" : "not_configured"
      },
      diagnostics
    }, timing);
  } catch (error) {
    return handleRouteError(error);
  }
}
