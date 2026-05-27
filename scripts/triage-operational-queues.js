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
const staleHours = Number(env.OPERION_TRIAGE_STALE_HOURS ?? 72);
const now = new Date().toISOString();

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service-role environment is required for operational triage.");
  }

  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const records = await loadRecords(db);
  const plan = buildPlan(records);

  if (execute) {
    await applyPlan(db, plan);
  }

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "dry-run",
        generatedAt: now,
        staleHours,
        summary: summarizePlan(plan),
        plan
      },
      null,
      2
    )
  );
}

async function loadRecords(db) {
  const [aiTasks, agentTasks, approvals, outreach, reviews, applications] = await Promise.all([
    query(db.from("ai_tasks").select("*").order("created_at", { ascending: true }).limit(500), "ai_tasks"),
    query(db.from("agent_task_queue").select("*").order("created_at", { ascending: true }).limit(500), "agent_task_queue"),
    query(db.from("agent_approval_requests").select("*").order("created_at", { ascending: true }).limit(500), "agent_approval_requests"),
    query(db.from("outreach_email_queue").select("*").order("created_at", { ascending: true }).limit(500), "outreach_email_queue"),
    query(db.from("underwriting_reviews").select("*").order("created_at", { ascending: true }).limit(500), "underwriting_reviews"),
    query(db.from("business_applications").select("id,status,metadata,created_at,updated_at").limit(1000), "business_applications")
  ]);

  return {
    aiTasks,
    agentTasks,
    approvals,
    outreach,
    reviews,
    applicationsById: new Map(applications.map((application) => [application.id, application]))
  };
}

async function query(builder, name) {
  const { data, error } = await builder;
  if (error) {
    throw new Error(`${name}: ${error.message}`);
  }
  return data ?? [];
}

function buildPlan(records) {
  const approvalIdsToCancel = new Set();
  const plan = {
    aiTasks: [],
    agentTasks: [],
    approvals: [],
    outreach: [],
    underwritingReviews: []
  };

  for (const task of records.agentTasks) {
    if (!["queued", "assigned", "running", "blocked"].includes(task.status)) continue;

    if (isQaArtifact(task) || (isStale(task) && task.status === "queued" && !task.requires_approval)) {
      plan.agentTasks.push({
        id: task.id,
        from: task.status,
        to: "cancelled",
        reason: isQaArtifact(task)
          ? "Controlled beta triage: archived QA/verification workflow artifact."
          : "Controlled beta triage: cancelled stale unattended workflow before live activation."
      });
      if (task.approval_id) approvalIdsToCancel.add(task.approval_id);
    }
  }

  for (const approval of records.approvals) {
    if (approval.status !== "pending") continue;

    if (isQaArtifact(approval) || approvalIdsToCancel.has(approval.id)) {
      plan.approvals.push({
        id: approval.id,
        from: approval.status,
        to: "rejected",
        reason: "Controlled beta triage: archived stale QA/simulation approval artifact."
      });
    }
  }

  for (const item of records.outreach) {
    if (!["queued", "pending_approval", "sending"].includes(item.status)) continue;

    if (isQaArtifact(item) || isStale(item)) {
      plan.outreach.push({
        id: item.id,
        from: item.status,
        to: "cancelled",
        reason: isQaArtifact(item)
          ? "Controlled beta triage: cancelled QA/simulation outreach artifact."
          : "Controlled beta triage: cancelled stale unsent outreach before controlled live activation."
      });
      if (item.approval_id) approvalIdsToCancel.add(item.approval_id);
    }
  }

  for (const task of records.aiTasks) {
    if (task.status !== "queued") continue;

    const hasApplication = Boolean(task.business_application_id && records.applicationsById.has(task.business_application_id));
    if (isStale(task) || !hasApplication) {
      plan.aiTasks.push({
        id: task.id,
        from: task.status,
        to: "blocked",
        reason: hasApplication
          ? "Controlled beta triage: stale AI task requires founder review before retry."
          : "Controlled beta triage: unlinked AI task blocked to prevent uncontrolled execution."
      });
    }
  }

  for (const review of records.reviews) {
    if (!["queued", "in_review"].includes(review.status)) continue;

    if (isStale(review)) {
      plan.underwritingReviews.push({
        id: review.id,
        from: review.status,
        to: "escalated",
        reason: "Controlled beta triage: stale underwriting review escalated for founder/operator review."
      });
    }
  }

  return plan;
}

async function applyPlan(db, plan) {
  for (const item of plan.aiTasks) {
    await checkedUpdate(
      "ai_tasks",
      db.from("ai_tasks").update({
        status: item.to,
        error_message: item.reason,
        updated_at: now
      }).eq("id", item.id).eq("status", item.from)
    );
  }

  for (const item of plan.agentTasks) {
    await checkedUpdate(
      "agent_task_queue",
      db.from("agent_task_queue").update({
        status: item.to,
        error_message: item.reason,
        completed_at: now,
        updated_at: now
      }).eq("id", item.id).eq("status", item.from)
    );
  }

  for (const item of plan.approvals) {
    await checkedUpdate(
      "agent_approval_requests",
      db.from("agent_approval_requests").update({
        status: item.to,
        decision_reason: item.reason,
        decided_by: "controlled_beta_triage",
        decided_at: now,
        updated_at: now
      }).eq("id", item.id).eq("status", item.from)
    );
  }

  for (const item of plan.outreach) {
    await checkedUpdate(
      "outreach_email_queue",
      db.from("outreach_email_queue").update({
        status: item.to,
        last_error: item.reason,
        updated_at: now
      }).eq("id", item.id).eq("status", item.from)
    );
  }

  for (const item of plan.underwritingReviews) {
    await checkedUpdate(
      "underwriting_reviews",
      db.from("underwriting_reviews").update({
        status: item.to,
        notes: item.reason,
        updated_at: now
      }).eq("id", item.id).eq("status", item.from)
    );
  }
}

async function checkedUpdate(table, builder) {
  const { error } = await builder;
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
}

function summarizePlan(plan) {
  return Object.fromEntries(Object.entries(plan).map(([key, items]) => [key, items.length]));
}

function isQaArtifact(row) {
  const text = JSON.stringify(row).toLowerCase();
  return (
    row.is_test_data === true ||
    text.includes("simulation") ||
    text.includes("operion-e2e") ||
    text.includes("live-verification") ||
    text.includes("approval verification") ||
    text.includes("test artifact")
  );
}

function isStale(row) {
  if (!row.created_at) return false;
  return (Date.now() - new Date(row.created_at).getTime()) / 3_600_000 >= staleHours;
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
