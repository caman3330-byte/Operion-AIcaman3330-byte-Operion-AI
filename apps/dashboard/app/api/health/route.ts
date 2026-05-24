import { NextResponse } from "next/server";
import { getConfigurationStatus, validateSupabaseEnv } from "@/lib/env";
import { handleRouteError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const MIGRATION_FILE_BY_SCHEMA: Record<string, string> = {
  managerAgentSchema: "packages/database/migrations/0002_manager_agent_orchestration.sql",
  multiAgentSchema: "packages/database/migrations/0003_multi_agent_architecture.sql",
  acquisitionSchema: "packages/database/migrations/0004_lead_acquisition_outreach.sql",
  simulationSchema: "packages/database/migrations/0005_internal_testing_simulation.sql",
  phase1Schema: "packages/database/migrations/0006_phase1_public_mvp.sql",
  platformSchema: "packages/database/migrations/0007_platform_separation_fintech_schema.sql",
  productionSchema: "packages/database/migrations/0008_production_mca_platform.sql",
  phase2Schema: "packages/database/migrations/0009_phase2_ai_operations.sql",
  applicationLifecycleSchema: "packages/database/migrations/0010_add_business_application_status_needs_review.sql",
  operationalCrmSchema: "packages/database/migrations/0011_phase3_operational_crm.sql",
  internalRolesSchema: "packages/database/migrations/0012_internal_roles_app_role.sql",
  operationalTablesSchema: "packages/database/migrations/0013_operational_tables.sql",
  crmBusinessApplicationLinkSchema: "packages/database/migrations/0014_crm_business_application_link.sql",
  documentPortalSchema: "packages/database/migrations/0015_secure_document_upload_portal.sql"
};

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const configuration = getConfigurationStatus();
    const supabaseEnvValidation = validateSupabaseEnv();
    if (!supabaseEnvValidation.success) {
      return NextResponse.json(
        {
          status: "degraded",
          timestamp: new Date().toISOString(),
          services: {
            database: "not_configured",
            managerAgentSchema: "not_configured",
            multiAgentSchema: "not_configured",
            acquisitionSchema: "not_configured",
            simulationSchema: "not_configured",
            phase1Schema: "not_configured",
            platformSchema: "not_configured",
            productionSchema: "not_configured",
            phase2Schema: "not_configured",
            applicationLifecycleSchema: "not_configured",
            operationalCrmSchema: "not_configured",
            internalRolesSchema: "not_configured",
            operationalTablesSchema: "not_configured",
            crmBusinessApplicationLinkSchema: "not_configured",
            documentPortalSchema: "not_configured",
            auth: "not_configured",
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
          diagnostics: {
            supabaseEnv: supabaseEnvValidation.errors
          }
        },
        { status: 503 }
      );
    }

    let database: "ok" | "not_configured" | "error" = "ok";
    let managerAgentSchema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let multiAgentSchema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let acquisitionSchema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let simulationSchema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let phase1Schema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let platformSchema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let productionSchema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let phase2Schema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let applicationLifecycleSchema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let operationalCrmSchema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let internalRolesSchema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let operationalTablesSchema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let crmBusinessApplicationLinkSchema: "ok" | "not_configured" | "missing" | "error" = "ok";
    let documentPortalSchema: "ok" | "not_configured" | "missing" | "error" = "ok";

    if (configuration.supabase) {
      const supabase = getSupabaseAdmin();
      const rawSupabase = supabase as unknown as { from: (table: string) => any };
      const { error } = await supabase.from("leads").select("id").limit(1);
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

      const { error: lifecycleSchemaError } = await getSupabaseAdmin()
        .from("business_applications")
        .select("id")
        .in("status", ["needs_review", "reviewed", "routed"])
        .limit(1);
      if (lifecycleSchemaError) {
        applicationLifecycleSchema = isEnumValueError(lifecycleSchemaError) ? "missing" : isMissingTableError(lifecycleSchemaError, "business_applications") ? "missing" : "error";
      }

      const { error: operationalCrmSchemaError } = await getSupabaseAdmin().from("crm_activities").select("id").limit(1);
      if (operationalCrmSchemaError) {
        operationalCrmSchema = isMissingTableError(operationalCrmSchemaError, "crm_activities") ? "missing" : "error";
      }

      const { error: internalRolesSchemaError } = await getSupabaseAdmin()
        .from("profiles")
        .select("id")
        .in("role", ["admin", "operator", "analyst", "super_admin"])
        .limit(1);
      if (internalRolesSchemaError) {
        internalRolesSchema = isEnumValueError(internalRolesSchemaError) ? "missing" : isMissingTableError(internalRolesSchemaError, "profiles") ? "missing" : "error";
      }

      const { error: operationalTablesSchemaError } = await rawSupabase.from("funding_pipeline").select("id").limit(1);
      if (operationalTablesSchemaError) {
        operationalTablesSchema = isMissingTableError(operationalTablesSchemaError, "funding_pipeline") ? "missing" : "error";
      }

      const { error: crmBusinessApplicationLinkSchemaError } = await getSupabaseAdmin()
        .from("crm_activities")
        .select("business_application_id")
        .limit(1);
      if (crmBusinessApplicationLinkSchemaError) {
        crmBusinessApplicationLinkSchema = isMissingColumnError(crmBusinessApplicationLinkSchemaError) ? "missing" : "error";
      }

      const { error: documentPortalColumnError } = await getSupabaseAdmin()
        .from("documents")
        .select("storage_bucket,metadata,processing_status")
        .limit(1);
      const { error: documentPortalSessionError } = await rawSupabase.from("merchant_upload_sessions").select("id").limit(1);
      const { error: merchantBucketError } = await getSupabaseAdmin().storage.getBucket("merchant-documents");
      const { error: underwritingBucketError } = await getSupabaseAdmin().storage.getBucket("underwriting-documents");
      if (documentPortalColumnError || documentPortalSessionError || merchantBucketError || underwritingBucketError) {
        documentPortalSchema =
          isMissingColumnError(documentPortalColumnError ?? {}) ||
          isMissingTableError(documentPortalSessionError ?? {}, "merchant_upload_sessions") ||
          merchantBucketError ||
          underwritingBucketError
            ? "missing"
            : "error";
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
      phase2Schema,
      applicationLifecycleSchema,
      operationalCrmSchema,
      internalRolesSchema,
      operationalTablesSchema,
      crmBusinessApplicationLinkSchema,
      documentPortalSchema
    ];

    const requiredMigrations = buildRequiredMigrationHints({
      managerAgentSchema,
      multiAgentSchema,
      acquisitionSchema,
      simulationSchema,
      phase1Schema,
      platformSchema,
      productionSchema,
      phase2Schema,
      applicationLifecycleSchema,
      operationalCrmSchema,
      internalRolesSchema,
      operationalTablesSchema,
      crmBusinessApplicationLinkSchema,
      documentPortalSchema
    });

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
        applicationLifecycleSchema,
        operationalCrmSchema,
        internalRolesSchema,
        operationalTablesSchema,
        crmBusinessApplicationLinkSchema,
        documentPortalSchema,
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
      diagnostics: {
        latestMigration: "0015_secure_document_upload_portal.sql",
        expectedMigrations: Object.values(MIGRATION_FILE_BY_SCHEMA),
        requiredMigrations
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isMissingTableError(error: { code?: string; message?: string }, tableName: string) {
  return error.code === "42P01" || error.code === "PGRST205" || Boolean(error.message?.includes(tableName));
}

function isEnumValueError(error: { code?: string; message?: string }) {
  return error.code === "22P02" || Boolean(error.message?.includes("invalid input value for enum"));
}

function isMissingColumnError(error: { code?: string; message?: string }) {
  return error.code === "42703" || error.code === "PGRST204" || Boolean(error.message?.toLowerCase().includes("could not find") && error.message.toLowerCase().includes("column"));
}

function buildRequiredMigrationHints(schemaStates: Record<string, string>) {
  return Object.entries(schemaStates).reduce((acc, [schema, state]) => {
    if (state !== "ok" && MIGRATION_FILE_BY_SCHEMA[schema]) {
      acc[schema] = MIGRATION_FILE_BY_SCHEMA[schema];
    }
    return acc;
  }, {} as Record<string, string>);
}
