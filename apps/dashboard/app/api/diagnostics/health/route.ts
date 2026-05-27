import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { collectDiagnosticsSnapshot } from "@/lib/diagnostics/summary";
import { getConfigurationStatus } from "@/lib/env";
import { handleRouteError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const [configuration, diagnostics] = await Promise.all([
      Promise.resolve(getConfigurationStatus()),
      collectDiagnosticsSnapshot()
    ]);

    return NextResponse.json({
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
        internalApi: configuration.internalApi ? "configured" : "not_configured",
        slack: configuration.slack ? "configured" : "not_configured",
        n8n: configuration.n8n ? "configured" : "not_configured"
      },
      diagnostics
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
