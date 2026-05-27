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

const baseUrl = env.DASHBOARD_URL || env.BASE_URL || "https://www.operioncapital.com";
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    http: await collectHttpTelemetry(baseUrl)
  };

  if (!supabaseUrl || !serviceRoleKey) {
    snapshot.supabase = { configured: false };
    print(snapshot);
    return;
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  snapshot.supabase = {
    configured: true,
    ...(await collectQueueTelemetry(db))
  };

  print(snapshot);
}

async function collectHttpTelemetry(baseUrl) {
  const routes = ["/api/health", "/apply", "/portal/upload", "/supervisor/login"];
  const results = {};

  for (const route of routes) {
    const startedAt = Date.now();
    try {
      const response = await fetch(new URL(route, baseUrl), {
        redirect: "manual",
        headers: {
          "user-agent": "operion-live-beta-telemetry"
        }
      });
      const text = await response.text();
      results[route] = {
        status: response.status,
        totalMs: Date.now() - startedAt,
        runtimeMs: numberOrNull(response.headers.get("x-operion-runtime-ms")),
        bytes: text.length
      };
    } catch (error) {
      results[route] = {
        error: error instanceof Error ? error.message : String(error),
        totalMs: Date.now() - startedAt
      };
    }
  }

  return results;
}

async function collectQueueTelemetry(db) {
  const [aiTasks, agentTasks, approvals, traces, outreach, applications, aiLogs] = await Promise.all([
    safeQuery("ai_tasks", db.from("ai_tasks").select("status,task_type,attempts,created_at,updated_at").order("created_at", { ascending: true }).limit(500)),
    safeQuery("agent_task_queue", db.from("agent_task_queue").select("status,workflow_key,priority,created_at,updated_at,error_message").order("created_at", { ascending: true }).limit(500)),
    safeQuery("agent_approval_requests", db.from("agent_approval_requests").select("status,approval_type,created_at,updated_at").order("created_at", { ascending: true }).limit(500)),
    safeQuery("workflow_execution_traces", db.from("workflow_execution_traces").select("workflow_key,step_key,status,attempt,latency_ms,created_at").order("created_at", { ascending: false }).limit(200)),
    safeQuery("outreach_email_queue", db.from("outreach_email_queue").select("status,scheduled_at,created_at,updated_at").order("created_at", { ascending: true }).limit(500)),
    safeQuery("business_applications", db.from("business_applications").select("status,created_at,updated_at").order("created_at", { ascending: true }).limit(500)),
    safeQuery("ai_task_logs", db.from("ai_task_logs").select("status,provider,model,latency_ms,created_at").order("created_at", { ascending: false }).limit(200))
  ]);

  const summaries = {
    aiTasks: summarizeAiTasks(aiTasks),
    agentQueue: summarizeAgentQueue(agentTasks),
    approvals: summarizeApprovals(approvals),
    workflowTraces: summarizeLatencyRows(traces, "status"),
    outreachQueue: summarizeOutreach(outreach),
    applications: summarizeApplications(applications),
    aiLogs: summarizeLatencyRows(aiLogs, "status")
  };

  return {
    queueHealth: summarizeQueueHealth(summaries),
    ...summaries
  };
}

async function safeQuery(name, query) {
  const { data, error } = await query;
  if (error) {
    return { name, error: error.message, rows: [] };
  }
  return { name, rows: data ?? [] };
}

function summarizeAiTasks(result) {
  if (result.error) return { error: result.error };
  const rows = result.rows;
  const queued = rows.filter((row) => row.status === "queued");
  const blocked = rows.filter((row) => row.status === "blocked");
  const running = rows.filter((row) => row.status === "running");

  return {
    total: rows.length,
    byStatus: countBy(rows, "status"),
    queuedByType: countBy(queued, "task_type"),
    blockedByType: countBy(blocked, "task_type"),
    runningByType: countBy(running, "task_type"),
    retryQueued: queued.filter((row) => Number(row.attempts ?? 0) > 0).length,
    oldestQueuedAgeHours: queued[0] ? ageHours(queued[0].created_at) : null,
    oldestBlockedAgeHours: blocked[0] ? ageHours(blocked[0].created_at) : null,
    oldestRunningAgeHours: running[0] ? ageHours(running[0].updated_at || running[0].created_at) : null
  };
}

function summarizeAgentQueue(result) {
  if (result.error) return { error: result.error };
  const rows = result.rows;
  const active = rows.filter((row) => ["queued", "assigned", "running", "blocked"].includes(row.status));

  return {
    total: rows.length,
    byStatus: countBy(rows, "status"),
    activeByWorkflow: countBy(active, "workflow_key"),
    oldestActiveAgeHours: active[0] ? ageHours(active[0].created_at) : null,
    oldestActiveWorkflow: active[0]?.workflow_key ?? null
  };
}

function summarizeOutreach(result) {
  if (result.error) return { error: result.error };
  const rows = result.rows;
  const pending = rows.filter((row) => ["queued", "pending_approval", "sending"].includes(row.status));

  return {
    total: rows.length,
    byStatus: countBy(rows, "status"),
    retryQueued: pending.filter((row) => Number(row.retry_count ?? 0) > 0).length,
    oldestPendingAgeHours: pending[0] ? ageHours(pending[0].created_at) : null
  };
}

function summarizeApprovals(result) {
  if (result.error) return { error: result.error };
  const rows = result.rows;
  const pending = rows.filter((row) => row.status === "pending");

  return {
    total: rows.length,
    byStatus: countBy(rows, "status"),
    pendingByType: countBy(pending, "approval_type"),
    oldestPendingAgeHours: pending[0] ? ageHours(pending[0].created_at) : null
  };
}

function summarizeApplications(result) {
  if (result.error) return { error: result.error };
  const rows = result.rows;
  const oldestOpen = rows.find((row) => !["funded", "declined", "withdrawn", "closed"].includes(row.status));

  return {
    total: rows.length,
    byStatus: countBy(rows, "status"),
    oldestOpenAgeHours: oldestOpen ? ageHours(oldestOpen.created_at) : null
  };
}

function summarizeLatencyRows(result, statusKey) {
  if (result.error) return { error: result.error };
  const rows = result.rows;
  const latencies = rows
    .map((row) => row.latency_ms)
    .filter((value) => typeof value === "number")
    .sort((left, right) => left - right);

  return {
    recent: rows.length,
    byStatus: countBy(rows, statusKey),
    avgLatencyMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
    p95LatencyMs: latencies.length ? latencies[Math.floor((latencies.length - 1) * 0.95)] : null,
    maxLatencyMs: latencies.length ? latencies[latencies.length - 1] : null
  };
}

function summarizeQueueHealth(summaries) {
  const queuedAi = summaries.aiTasks.byStatus?.queued ?? 0;
  const blockedAi = summaries.aiTasks.byStatus?.blocked ?? 0;
  const activeAgent =
    (summaries.agentQueue.byStatus?.queued ?? 0) +
    (summaries.agentQueue.byStatus?.assigned ?? 0) +
    (summaries.agentQueue.byStatus?.running ?? 0) +
    (summaries.agentQueue.byStatus?.blocked ?? 0);
  const pendingApprovals = summaries.approvals.byStatus?.pending ?? 0;
  const pendingOutreach =
    (summaries.outreachQueue.byStatus?.queued ?? 0) +
    (summaries.outreachQueue.byStatus?.pending_approval ?? 0) +
    (summaries.outreachQueue.byStatus?.sending ?? 0);
  const retryPressure =
    (summaries.aiTasks.retryQueued ?? 0) +
    (summaries.outreachQueue.retryQueued ?? 0);
  const staleWorkflowCount = [
    summaries.aiTasks.oldestQueuedAgeHours,
    summaries.agentQueue.oldestActiveAgeHours,
    summaries.outreachQueue.oldestPendingAgeHours,
    summaries.applications.oldestOpenAgeHours,
    summaries.approvals.oldestPendingAgeHours
  ].filter((age) => typeof age === "number" && age >= 72).length;

  const penalties =
    Math.min(30, blockedAi * 2) +
    Math.min(20, activeAgent * 2) +
    Math.min(20, pendingApprovals * 2) +
    Math.min(15, pendingOutreach) +
    Math.min(15, staleWorkflowCount * 5) +
    Math.min(10, retryPressure * 2);

  return {
    score: Math.max(0, 100 - penalties),
    oldestQueuedTaskAgeHours: maxNumber([
      summaries.aiTasks.oldestQueuedAgeHours,
      summaries.agentQueue.oldestActiveAgeHours,
      summaries.outreachQueue.oldestPendingAgeHours
    ]),
    oldestBlockedTaskAgeHours: maxNumber([
      summaries.aiTasks.oldestBlockedAgeHours,
      summaries.agentQueue.oldestActiveAgeHours
    ]),
    retryPressure,
    staleWorkflowCount,
    pendingApprovals,
    unresolvedWorkflows: queuedAi + blockedAi + activeAgent + pendingOutreach + pendingApprovals,
    recommendation:
      pendingApprovals > 0 || activeAgent > 0
        ? "Founder review required before enabling broader automation."
        : pendingOutreach > 0
          ? "Keep outreach paused until sender intent is reviewed."
          : queuedAi > 0 || blockedAi > 0
            ? "Review AI task backlog before scaling intake volume."
            : "Queue state is ready for controlled live validation."
  };
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function ageHours(iso) {
  if (!iso) return null;
  return Math.round(((Date.now() - new Date(iso).getTime()) / 3_600_000) * 10) / 10;
}

function maxNumber(values) {
  const numbers = values.filter((value) => typeof value === "number");
  return numbers.length ? Math.max(...numbers) : null;
}

function numberOrNull(value) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, "")];
      })
  );
}

function print(snapshot) {
  console.log(JSON.stringify(snapshot, null, 2));
}
