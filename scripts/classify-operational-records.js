#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const dashboardRoot = path.join(root, "apps", "dashboard");
const env = {
  ...readEnvFile(path.join(root, ".env.local")),
  ...readEnvFile(path.join(dashboardRoot, ".env.local")),
  ...process.env
};

const execute = process.argv.includes("--execute");
const confirmed = process.argv.includes("--confirm-qa-archive");
const staleHours = Number(env.OPERION_QA_STALE_HOURS ?? 72);
const generatedAt = new Date().toISOString();

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service-role environment is required for operational record classification.");
  }

  if (execute && !confirmed) {
    throw new Error("Refusing to mutate records without --confirm-qa-archive.");
  }

  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const records = await loadRecords(db);
  const classified = classifyRecords(records);
  const archivePlan = buildArchivePlan(classified.qa);

  if (execute) {
    await applyArchivePlan(db, archivePlan);
  }

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "dry-run",
        generatedAt,
        staleHours,
        operationalRiskBeforeMutation: archivePlan.length === 0
          ? "No QA records require soft archive action."
          : "Soft archive plan only targets records classified as QA/test/simulation. Review plan before using --execute --confirm-qa-archive.",
        summary: summarize(classified, archivePlan),
        qaRecords: classified.qa,
        liveRecordsWithQaSignals: classified.ambiguous,
        archivePlan
      },
      null,
      2
    )
  );
}

async function loadRecords(db) {
  const specs = [
    ["leads", "id,business_name,email,status,is_test_data,simulation_run_id,created_at,updated_at"],
    ["business_applications", "id,business_name,contact_email,status,metadata,created_at,updated_at"],
    ["ai_tasks", "id,task_type,status,business_application_id,lead_id,input_payload,error_message,created_by,created_at,updated_at"],
    ["agent_task_queue", "id,title,status,workflow_key,assigned_agent_key,approval_id,requires_approval,context,error_message,created_at,updated_at"],
    ["agent_approval_requests", "id,title,status,approval_type,task_id,details,created_at,updated_at"],
    ["outreach_email_queue", "id,status,to_email,subject,approval_id,is_test_data,last_error,created_at,updated_at"],
    ["outreach_campaigns", "id,name,status,is_test_data,audience_filter,created_at,updated_at"],
    ["workflow_execution_traces", "id,workflow_key,step_key,status,simulation_run_id,error_message,created_at"],
    ["simulation_runs", "id,name,status,mode,created_at,updated_at"],
    ["simulation_leads", "id,simulation_run_id,business_name,email,status,created_at,updated_at"]
  ];

  const entries = await Promise.all(specs.map(async ([table, columns]) => [table, await safeQuery(db, table, columns)]));
  return Object.fromEntries(entries);
}

async function safeQuery(db, table, columns) {
  const { data, error } = await db.from(table).select(columns).order("created_at", { ascending: true }).limit(500);
  if (error) {
    return { error: error.message, rows: [] };
  }
  return { rows: data ?? [] };
}

function classifyRecords(records) {
  const qa = [];
  const ambiguous = [];

  for (const [table, result] of Object.entries(records)) {
    if (result.error) {
      ambiguous.push({ table, id: null, label: "query unavailable", status: "unknown", reasons: [result.error], ageHours: null });
      continue;
    }

    for (const row of result.rows) {
      const classification = classifyRow(table, row);
      if (classification.confidence === "qa") {
        qa.push(classification.record);
      } else if (classification.confidence === "review") {
        ambiguous.push(classification.record);
      }
    }
  }

  return { qa, ambiguous };
}

function classifyRow(table, row) {
  const reasons = [];
  const text = JSON.stringify(row).toLowerCase();
  const explicitTest = row.is_test_data === true || hasMetadataFlag(row.metadata, "test_mode") || hasMetadataFlag(row.metadata, "simulation");
  const simulationLinked = Boolean(row.simulation_run_id) || table.startsWith("simulation_");
  const textualSignal =
    text.includes("simulation") ||
    text.includes("operion-e2e") ||
    text.includes("live-verification") ||
    text.includes("approval verification") ||
    text.includes("test artifact") ||
    text.includes("@example.com") ||
    text.includes(".test.operion.ai");

  if (explicitTest) reasons.push("explicit test flag");
  if (simulationLinked) reasons.push("simulation-linked record");
  if (textualSignal) reasons.push("test/simulation text marker");

  const record = {
    table,
    id: row.id ?? null,
    label: labelFor(row),
    status: row.status ?? "n/a",
    reasons,
    ageHours: ageHours(row.created_at),
    recommendedAction: "leave unchanged"
  };

  if (explicitTest || simulationLinked) {
    record.recommendedAction = softArchiveAction(table, row);
    return { confidence: "qa", record };
  }

  if (textualSignal) {
    record.recommendedAction = "manual review before any archive action";
    return { confidence: "review", record };
  }

  return { confidence: "live", record };
}

function buildArchivePlan(qaRecords) {
  return qaRecords
    .map((record) => {
      const to = targetStatus(record.table, record.status);
      if (!to || to === record.status) return null;
      return {
        table: record.table,
        id: record.id,
        from: record.status,
        to,
        reason: `Controlled beta QA isolation: ${record.reasons.join(", ")}.`
      };
    })
    .filter(Boolean);
}

async function applyArchivePlan(db, plan) {
  for (const item of plan) {
    const payload = mutationPayload(item);
    if (!payload) continue;
    const { error } = await db.from(item.table).update(payload).eq("id", item.id).eq("status", item.from);
    if (error) {
      throw new Error(`${item.table} ${item.id}: ${error.message}`);
    }
  }
}

function mutationPayload(item) {
  const updatedAt = new Date().toISOString();
  if (item.table === "leads") return { status: item.to, outreach_paused: true, processing_error_detail: item.reason, updated_at: updatedAt };
  if (item.table === "business_applications") return { status: item.to, updated_at: updatedAt };
  if (item.table === "ai_tasks") return { status: item.to, error_message: item.reason, updated_at: updatedAt };
  if (item.table === "agent_task_queue") return { status: item.to, error_message: item.reason, completed_at: updatedAt, updated_at: updatedAt };
  if (item.table === "agent_approval_requests") return { status: item.to, decision_reason: item.reason, decided_by: "qa_archive_utility", decided_at: updatedAt, updated_at: updatedAt };
  if (item.table === "outreach_email_queue") return { status: item.to, last_error: item.reason, updated_at: updatedAt };
  if (item.table === "outreach_campaigns") return { status: item.to, ended_at: updatedAt, updated_at: updatedAt };
  if (item.table === "simulation_runs") return { status: item.to, updated_at: updatedAt };
  return null;
}

function targetStatus(table, status) {
  if (table === "leads" && !["archived", "funded", "distributed"].includes(status)) return "archived";
  if (table === "business_applications" && !["funded", "rejected", "inactive", "withdrawn"].includes(status)) return "inactive";
  if (table === "ai_tasks" && ["queued", "running"].includes(status)) return "blocked";
  if (table === "agent_task_queue" && ["queued", "assigned", "running", "blocked"].includes(status)) return "cancelled";
  if (table === "agent_approval_requests" && status === "pending") return "rejected";
  if (table === "outreach_email_queue" && ["queued", "pending_approval", "sending"].includes(status)) return "cancelled";
  if (table === "outreach_campaigns" && status !== "archived") return "archived";
  if (table === "simulation_runs" && ["queued", "running"].includes(status)) return "cancelled";
  return null;
}

function softArchiveAction(table, row) {
  const target = targetStatus(table, row.status ?? "n/a");
  return target ? `soft archive to ${target}` : "retain as already inactive or historical QA record";
}

function summarize(classified, archivePlan) {
  return {
    qaRecordCount: classified.qa.length,
    liveRecordsWithQaSignals: classified.ambiguous.length,
    archiveActionCount: archivePlan.length,
    qaByTable: countBy(classified.qa, (record) => record.table),
    archiveActionsByTable: countBy(archivePlan, (record) => record.table)
  };
}

function hasMetadataFlag(metadata, key) {
  return Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata) && metadata[key] === true);
}

function labelFor(row) {
  return row.business_name ?? row.name ?? row.title ?? row.subject ?? row.workflow_key ?? row.task_type ?? row.email ?? row.to_email ?? "record";
}

function ageHours(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Number(((Date.now() - parsed) / 3_600_000).toFixed(1));
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const rawValue = line.slice(index + 1).trim();
        return [key, rawValue.replace(/^['"]|['"]$/g, "")];
      })
  );
}
