import { NextResponse } from "next/server";
import { getConfigurationStatus } from "@/lib/env";
import { handleRouteError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const configuration = getConfigurationStatus();
    let database: "ok" | "not_configured" | "error" = configuration.supabase ? "ok" : "not_configured";
    let managerAgentSchema: "ok" | "not_configured" | "missing" | "error" = configuration.supabase
      ? "ok"
      : "not_configured";
    let multiAgentSchema: "ok" | "not_configured" | "missing" | "error" = configuration.supabase
      ? "ok"
      : "not_configured";
    let acquisitionSchema: "ok" | "not_configured" | "missing" | "error" = configuration.supabase
      ? "ok"
      : "not_configured";
    let simulationSchema: "ok" | "not_configured" | "missing" | "error" = configuration.supabase
      ? "ok"
      : "not_configured";
    let phase1Schema: "ok" | "not_configured" | "missing" | "error" = configuration.supabase
      ? "ok"
      : "not_configured";
    let platformSchema: "ok" | "not_configured" | "missing" | "error" = configuration.supabase
      ? "ok"
      : "not_configured";
    let productionSchema: "ok" | "not_configured" | "missing" | "error" = configuration.supabase
      ? "ok"
      : "not_configured";
    let phase2Schema: "ok" | "not_configured" | "missing" | "error" = configuration.supabase
      ? "ok"
      : "not_configured";

    if (configuration.supabase) {
      const { error } = await getSupabaseAdmin().from("leads").select("id").limit(1);
      if (error) {
        database = "error";
      }

      const { error: managerSchemaError } = await getSupabaseAdmin().from("manager_agent_runs").select("id").limit(1);
      if (managerSchemaError) {
        managerAgentSchema = isMissingTableError(managerSchemaError, "manager_agent_runs") ? "missing" : "error";
      }

      const { error: multiAgentSchemaError } = await getSupabaseAdmin().from("agent_definitions").select("id").limit(1);
      if (multiAgentSchemaError) {
        multiAgentSchema = isMissingTableError(multiAgentSchemaError, "agent_definitions") ? "missing" : "error";
      }

      const { error: acquisitionSchemaError } = await getSupabaseAdmin().from("lead_sources").select("id").limit(1);
      if (acquisitionSchemaError) {
        acquisitionSchema = isMissingTableError(acquisitionSchemaError, "lead_sources") ? "missing" : "error";
      }

      const { error: simulationSchemaError } = await getSupabaseAdmin().from("simulation_runs").select("id").limit(1);
      if (simulationSchemaError) {
        simulationSchema = isMissingTableError(simulationSchemaError, "simulation_runs") ? "missing" : "error";
      }

      const { error: phase1SchemaError } = await getSupabaseAdmin().from("applications").select("id").limit(1);
      if (phase1SchemaError) {
        phase1Schema = isMissingTableError(phase1SchemaError, "applications") ? "missing" : "error";
      }

      const { error: platformSchemaError } = await getSupabaseAdmin().from("notifications").select("id").limit(1);
      if (platformSchemaError) {
        platformSchema = isMissingTableError(platformSchemaError, "notifications") ? "missing" : "error";
      }

      const { error: productionSchemaError } = await getSupabaseAdmin().from("business_applications").select("id").limit(1);
      if (productionSchemaError) {
        productionSchema = isMissingTableError(productionSchemaError, "business_applications") ? "missing" : "error";
      }

      const { data: phase2Rows, error: phase2SchemaError } = await getSupabaseAdmin()
        .from("agent_definitions")
        .select("id")
        .eq("agent_key", "ai_task_dispatcher_agent")
        .limit(1);
      if (phase2SchemaError) {
        phase2Schema = isMissingTableError(phase2SchemaError, "agent_definitions") ? "missing" : "error";
      } else if ((phase2Rows ?? []).length === 0) {
        phase2Schema = "missing";
      }
    }

    const schemaStates = [
      database,
      managerAgentSchema,
      multiAgentSchema,
      acquisitionSchema,
      simulationSchema,
      phase1Schema,
      platformSchema,
      productionSchema,
      phase2Schema
    ];

    return NextResponse.json({
      status: schemaStates.some((state) => state === "error" || state === "missing") ? "degraded" : "ok",
      timestamp: new Date().toISOString(),
      services: {
        database,
        managerAgentSchema,
        multiAgentSchema,
        acquisitionSchema,
        simulationSchema,
        phase1Schema,
        platformSchema,
        productionSchema,
        phase2Schema,
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
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isMissingTableError(error: { code?: string; message?: string }, tableName: string) {
  return error.code === "42P01" || error.code === "PGRST205" || Boolean(error.message?.includes(tableName));
}
