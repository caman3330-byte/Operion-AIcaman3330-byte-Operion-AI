import { getConfigurationStatus } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type MetricTone = "default" | "success" | "warning" | "danger";
export type MetricAvailability = "available" | "partial" | "unavailable";

export interface FounderMetric {
  label: string;
  value: string;
  detail: string;
  tone: MetricTone;
  availability: MetricAvailability;
}

export interface FounderTrendRow {
  label: string;
  discovered: number;
  qualified: number;
  imported: number;
  applications: number;
}

export interface FounderSourceRow {
  sourceName: string;
  industry: string;
  state: string;
  status: string;
  discovered: number;
  verified: number;
  successRate: number;
  conversionRate: number;
  lastScannedAt: string | null;
}

export interface FounderQueueRow {
  label: string;
  queued: number;
  running: number;
  failed: number;
  blocked: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

export interface FounderReliabilityEvent {
  label: string;
  status: string;
  detail: string;
  occurredAt: string | null;
  tone: MetricTone;
}

export interface FounderOperationsDashboard {
  generatedAt: string;
  dailyKpis: FounderMetric[];
  aiOperations: {
    scheduler: FounderMetric[];
    queues: FounderQueueRow[];
    usage: FounderMetric[];
  };
  acquisitionAnalytics: {
    dailyTrend: FounderTrendRow[];
    weeklyTrend: FounderTrendRow[];
    monthlyTrend: FounderTrendRow[];
    sourcePerformance: FounderSourceRow[];
    topSources: FounderSourceRow[];
  };
  reliability: {
    health: FounderMetric[];
    events: FounderReliabilityEvent[];
  };
  security: FounderMetric[];
  unavailableMetrics: FounderMetric[];
}

type QueryResult<T> = {
  data: T[];
  error: string | null;
};

type CandidateRow = {
  id: string;
  source_id: string;
  business_name: string;
  website_verified: boolean;
  phone_verified: boolean;
  email_found: boolean;
  identity_match: boolean;
  enrichment_status: string;
  import_review_status: string;
  quality_score: number;
  created_at: string;
  updated_at: string;
  last_enriched_at: string | null;
};

type SourceRow = {
  id: string;
  source_name: string;
  industry: string;
  state: string | null;
  active: boolean;
  approval_status: string;
  health_status: string;
  last_scanned_at: string | null;
  success_rate: number;
  source_quality_score: number;
  acquisition_yield_score: number;
  scan_success_count: number;
  scan_failure_count: number;
  extracted_business_count: number;
  test_businesses_validated: number;
};

type SourceScanRow = {
  id: string;
  source_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  extracted_businesses: number;
  verified_businesses: number;
  rejected_businesses: number;
  duplicate_businesses: number;
  robots_blocked: boolean;
  error_message: string | null;
};

type DiscoveryRunRow = {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  candidate_sources_found: number;
  candidate_sources_stored: number;
  duplicates: number;
  blocked_or_unreachable: number;
  errors: string[];
};

type AcquisitionJobRow = {
  id: string;
  job_type: string;
  status: string;
  result_summary: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type EmailQueueRow = {
  id: string;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type OutreachHistoryRow = {
  id: string;
  lead_id: string;
  email_number: number;
  sent_at: string | null;
  opened: boolean;
  replied: boolean;
  created_at: string;
};

type ReplyRow = {
  id: string;
  classification: string;
  received_at: string;
  created_at: string;
};

type ApplicationRow = {
  id: string;
  status: string;
  requested_amount: number;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

type LenderMatchRow = {
  id: string;
  status: string;
  match_score: number | null;
  submitted_at: string | null;
  decision_at: string | null;
  created_at: string;
  updated_at: string;
};

type FundingOfferRow = {
  id: string;
  status: string;
  amount: number;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

type AiTaskRow = {
  id: string;
  task_type: string;
  status: string;
  cost_estimate_usd: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type ApiUsageRow = {
  id: string;
  service: string;
  operation: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  success: boolean | null;
  latency_ms: number | null;
  created_at: string;
};

type WorkflowTraceRow = {
  id: string;
  workflow_key: string;
  step_key: string;
  status: string;
  latency_ms: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  event_type: string;
  entity_type: string;
  created_at: string;
};

type WorkerStateRow = {
  control_key: string;
  workers_paused: boolean;
  updated_at: string;
};

export async function getFounderOperationsDashboard(): Promise<FounderOperationsDashboard> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = addDays(todayStart, -6);
  const monthStart = addDays(todayStart, -29);
  const config = getConfigurationStatus();

  const [
    candidateResult,
    sourceResult,
    scanResult,
    discoveryRunResult,
    acquisitionJobResult,
    emailQueueResult,
    outreachHistoryResult,
    replyResult,
    applicationResult,
    lenderMatchResult,
    fundingOfferResult,
    aiTaskResult,
    apiUsageResult,
    workflowTraceResult,
    auditLogResult,
    workerStateResult
  ] = await Promise.all([
    collect<CandidateRow>(
      supabase
        .from("merchant_acquisition_candidates")
        .select(
          "id,source_id,business_name,website_verified,phone_verified,email_found,identity_match,enrichment_status,import_review_status,quality_score,created_at,updated_at,last_enriched_at"
        )
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(5000)
    ),
    collect<SourceRow>(
      supabase
        .from("merchant_acquisition_sources")
        .select(
          "id,source_name,industry,state,active,approval_status,health_status,last_scanned_at,success_rate,source_quality_score,acquisition_yield_score,scan_success_count,scan_failure_count,extracted_business_count,test_businesses_validated"
        )
        .order("last_scanned_at", { ascending: false, nullsFirst: false })
        .limit(500)
    ),
    collect<SourceScanRow>(
      supabase
        .from("merchant_acquisition_source_scans")
        .select("id,source_id,status,started_at,completed_at,extracted_businesses,verified_businesses,rejected_businesses,duplicate_businesses,robots_blocked,error_message")
        .gte("started_at", monthStart.toISOString())
        .order("started_at", { ascending: false })
        .limit(1000)
    ),
    collect<DiscoveryRunRow>(
      supabase
        .from("merchant_source_discovery_runs")
        .select("id,status,started_at,completed_at,candidate_sources_found,candidate_sources_stored,duplicates,blocked_or_unreachable,errors")
        .gte("started_at", monthStart.toISOString())
        .order("started_at", { ascending: false })
        .limit(300)
    ),
    collect<AcquisitionJobRow>(
      supabase
        .from("acquisition_jobs")
        .select("id,job_type,status,result_summary,error_message,created_at,started_at,completed_at")
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000)
    ),
    collect<EmailQueueRow>(
      supabase
        .from("outreach_email_queue")
        .select("id,status,scheduled_at,sent_at,retry_count,last_error,created_at,updated_at")
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000)
    ),
    collect<OutreachHistoryRow>(
      supabase
        .from("outreach_history")
        .select("id,lead_id,email_number,sent_at,opened,replied,created_at")
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000)
    ),
    collect<ReplyRow>(
      supabase
        .from("outreach_replies")
        .select("id,classification,received_at,created_at")
        .gte("received_at", monthStart.toISOString())
        .order("received_at", { ascending: false })
        .limit(1000)
    ),
    collect<ApplicationRow>(
      supabase
        .from("business_applications")
        .select("id,status,requested_amount,submitted_at,created_at,updated_at")
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000)
    ),
    collect<LenderMatchRow>(
      supabase
        .from("lender_matches")
        .select("id,status,match_score,submitted_at,decision_at,created_at,updated_at")
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000)
    ),
    collect<FundingOfferRow>(
      supabase
        .from("funding_offers")
        .select("id,status,amount,accepted_at,created_at,updated_at")
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000)
    ),
    collect<AiTaskRow>(
      supabase
        .from("ai_tasks")
        .select("id,task_type,status,cost_estimate_usd,error_message,created_at,started_at,completed_at")
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000)
    ),
    collect<ApiUsageRow>(
      supabase
        .from("api_usage_log")
        .select("id,service,operation,input_tokens,output_tokens,estimated_cost_usd,success,latency_ms,created_at")
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(3000)
    ),
    collect<WorkflowTraceRow>(
      supabase
        .from("workflow_execution_traces")
        .select("id,workflow_key,step_key,status,latency_ms,error_message,started_at,completed_at,created_at")
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000)
    ),
    collect<AuditLogRow>(
      supabase
        .from("audit_log")
        .select("id,event_type,entity_type,created_at")
        .gte("created_at", monthStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000)
    ),
    collect<WorkerStateRow>(supabase.from("worker_control_state").select("control_key,workers_paused,updated_at").limit(50))
  ]);

  const candidates = candidateResult.data;
  const sources = sourceResult.data;
  const scans = scanResult.data;
  const discoveryRuns = discoveryRunResult.data;
  const acquisitionJobs = acquisitionJobResult.data;
  const emails = emailQueueResult.data;
  const outreachHistory = outreachHistoryResult.data;
  const replies = replyResult.data;
  const applications = applicationResult.data;
  const lenderMatches = lenderMatchResult.data;
  const fundingOffers = fundingOfferResult.data;
  const aiTasks = aiTaskResult.data;
  const usage = apiUsageResult.data;
  const traces = workflowTraceResult.data;
  const auditLogs = auditLogResult.data;
  const workerStates = workerStateResult.data;

  const todayCandidates = candidates.filter((row) => inWindow(row.created_at, todayStart));
  const todayEmails = emails.filter((row) => inWindow(row.created_at, todayStart) || inWindow(row.sent_at, todayStart));
  const todayOutreachHistory = outreachHistory.filter((row) => inWindow(row.created_at, todayStart) || inWindow(row.sent_at, todayStart));
  const todayReplies = replies.filter((row) => inWindow(row.received_at, todayStart));
  const todayApplications = applications.filter((row) => inWindow(row.created_at, todayStart));
  const todayMatches = lenderMatches.filter((row) => inWindow(row.created_at, todayStart));
  const todayOffers = fundingOffers.filter((row) => inWindow(row.created_at, todayStart) || inWindow(row.accepted_at, todayStart));
  const todayUsage = usage.filter((row) => inWindow(row.created_at, todayStart));
  const todayTasks = aiTasks.filter((row) => inWindow(row.created_at, todayStart));
  const todayTraces = traces.filter((row) => inWindow(row.created_at, todayStart));
  const todayJobs = acquisitionJobs.filter((row) => inWindow(row.created_at, todayStart));
  const todayScans = scans.filter((row) => inWindow(row.started_at, todayStart));

  const qualifiedToday = todayCandidates.filter(isQualifiedCandidate).length;
  const approvedToday = todayCandidates.filter((row) => row.import_review_status === "approved").length;
  const importedToday = todayCandidates.filter((row) => row.import_review_status === "imported").length;
  const emailsSentToday = emails.filter((row) => inWindow(row.sent_at, todayStart) || row.status === "sent" && inWindow(row.updated_at, todayStart)).length;
  const queuedEmailsToday = todayEmails.filter((row) => row.status === "queued" || row.status === "pending_approval").length;
  const deliveriesToday = auditLogs.filter((row) => row.event_type === "sendgrid_delivered" && inWindow(row.created_at, todayStart)).length;
  const opensToday = todayOutreachHistory.filter((row) => row.opened).length;
  const bouncesToday = auditLogs.filter((row) => row.event_type === "sendgrid_bounce" && inWindow(row.created_at, todayStart)).length +
    todayEmails.filter((row) => String(row.last_error ?? "").includes("sendgrid_bounce")).length;
  const emailFailuresToday = todayEmails.filter((row) => row.status === "failed").length;
  const openRate = emailsSentToday > 0 ? Math.round((opensToday / emailsSentToday) * 100) : null;
  const bounceRate = emailsSentToday > 0 ? Math.round((bouncesToday / emailsSentToday) * 100) : null;
  const positiveRepliesToday = todayReplies.filter((row) => row.classification === "positive").length;
  const submittedApplicationsToday = applications.filter((row) => inWindow(row.submitted_at, todayStart)).length;
  const fundedApplicationsToday = applications.filter((row) => row.status === "funded" && inWindow(row.updated_at, todayStart)).length;
  const acceptedOfferVolumeToday = todayOffers
    .filter((row) => row.status === "accepted")
    .reduce((sum, row) => sum + row.amount, 0);
  const fundedApplicationVolumeToday = applications
    .filter((row) => row.status === "funded" && inWindow(row.updated_at, todayStart))
    .reduce((sum, row) => sum + row.requested_amount, 0);

  const apiCost = sum(todayUsage.map((row) => row.estimated_cost_usd ?? 0));
  const taskCost = sum(todayTasks.map((row) => row.cost_estimate_usd ?? 0));
  const inputTokens = sum(todayUsage.map((row) => row.input_tokens ?? 0));
  const outputTokens = sum(todayUsage.map((row) => row.output_tokens ?? 0));
  const failedExecutions = todayTasks.filter((row) => row.status === "failed").length +
    todayJobs.filter((row) => row.status === "failed").length +
    todayTraces.filter((row) => row.status === "failed").length +
    todayScans.filter((row) => row.status === "failed").length;
  const totalExecutions = todayTasks.length + todayJobs.length + todayTraces.length + todayScans.length;
  const errorRate = totalExecutions > 0 ? Math.round((failedExecutions / totalExecutions) * 100) : 0;
  const replyRate = emailsSentToday > 0 ? Math.round((todayReplies.length / emailsSentToday) * 100) : 0;

  const queryErrors = [
    candidateResult,
    sourceResult,
    scanResult,
    discoveryRunResult,
    acquisitionJobResult,
    emailQueueResult,
    outreachHistoryResult,
    replyResult,
    applicationResult,
    lenderMatchResult,
    fundingOfferResult,
    aiTaskResult,
    apiUsageResult,
    workflowTraceResult,
    auditLogResult,
    workerStateResult
  ].filter((result) => result.error);

  const unsupported = [
    metric("Failed logins", "Not Tracked", "Supabase Auth log events are not persisted in application tables.", "warning", "unavailable"),
    metric("Blocked requests", "Not Tracked", "Middleware does not currently persist blocked request counters.", "warning", "unavailable"),
    metric("Webhook verification failures", "Not Tracked", "SendGrid verification failures are rejected but not yet persisted as metrics.", "warning", "unavailable")
  ];

  const reliabilityEvents = buildReliabilityEvents(scans, discoveryRuns, acquisitionJobs, aiTasks, traces, emails);

  return {
    generatedAt: now.toISOString(),
    dailyKpis: [
      metric("Merchants Discovered", String(todayCandidates.length), "New merchant candidates created today.", "default", "available"),
      metric("Qualified Merchants", String(qualifiedToday), "Verified website + phone + identity match + score >= 80.", qualifiedToday > 0 ? "success" : "default", "available"),
      metric("Approved Merchants", String(approvedToday), "Merchant candidates approved for import review today.", "default", "available"),
      metric("Imports Completed", String(importedToday), "Merchant candidates marked imported today.", importedToday > 0 ? "success" : "default", "available"),
      metric("Emails Queued", String(queuedEmailsToday), "Outreach emails queued or pending approval today.", queuedEmailsToday > 20 ? "warning" : "default", "available"),
      metric("Emails Sent", String(emailsSentToday), "Outreach emails sent today.", emailsSentToday > 0 ? "success" : "default", "available"),
      metric("Deliveries", deliveriesToday > 0 ? String(deliveriesToday) : "Not Tracked", "SendGrid delivered webhook events recorded today. Accepted-by-provider sends remain separate from delivered events.", deliveriesToday > 0 ? "success" : "default", deliveriesToday > 0 ? "available" : "partial"),
      metric("Open Rate", openRate === null ? "Not Tracked" : `${openRate}%`, "Opened outreach history rows divided by sent emails today.", openRate === null ? "default" : "success", openRate === null ? "partial" : "available"),
      metric("Bounce Rate", bounceRate === null ? "Not Tracked" : `${bounceRate}%`, "SendGrid bounce webhook events divided by sent emails today.", bounceRate && bounceRate > 0 ? "warning" : "success", bounceRate === null ? "partial" : "available"),
      metric("Email Failures", String(emailFailuresToday), "outreach_email_queue rows with failed status today.", emailFailuresToday > 0 ? "warning" : "success", "available"),
      metric("Reply Rate", `${replyRate}%`, "Replies received today divided by emails sent today.", emailsSentToday > 0 ? "success" : "default", "available"),
      metric("Positive Replies", String(positiveRepliesToday), "Replies classified as positive today.", positiveRepliesToday > 0 ? "success" : "default", "available"),
      metric("Applications Started", String(todayApplications.length), "Application records created today.", "default", "available"),
      metric("Applications Submitted", String(submittedApplicationsToday), "Application records submitted today.", submittedApplicationsToday > 0 ? "success" : "default", "available"),
      metric("Lender Matches", String(todayMatches.length), "Lender match rows created today.", todayMatches.length > 0 ? "success" : "default", "available"),
      metric("Deals Funded", String(fundedApplicationsToday), "Applications moved to funded today.", fundedApplicationsToday > 0 ? "success" : "default", "available"),
      metric(
        "Estimated Funded Volume",
        formatCurrency(acceptedOfferVolumeToday || fundedApplicationVolumeToday),
        acceptedOfferVolumeToday > 0 ? "Accepted funding offers today." : "Falls back to funded application requested amount when offer data is absent.",
        acceptedOfferVolumeToday || fundedApplicationVolumeToday ? "success" : "default",
        "partial"
      )
    ],
    aiOperations: {
      scheduler: [
        metric("Acquisition Scheduler", config.acquisitionScheduler ? "Enabled" : "Disabled", "Controlled by ACQUISITION_SCHEDULER_ENABLED.", config.acquisitionScheduler ? "success" : "warning", "available"),
        metric(
          "Merchant Intelligence Scheduler",
          config.merchantIntelligenceScheduler ? "Enabled" : "Disabled",
          "Controlled by MERCHANT_INTELLIGENCE_SCHEDULER_ENABLED.",
          config.merchantIntelligenceScheduler ? "success" : "warning",
          "available"
        ),
        metric("Worker Pause State", workerStates.some((row) => row.workers_paused) ? "Paused" : "Active", "Read from worker_control_state when present.", workerStates.some((row) => row.workers_paused) ? "warning" : "success", workerStates.length > 0 ? "available" : "partial")
      ],
      queues: [
        queueRow("AI Tasks", aiTasks, "created_at"),
        queueRow("Acquisition Jobs", acquisitionJobs, "created_at"),
        queueRow("Workflow Traces", traces, "created_at"),
        queueRow("Email Queue", emails, "created_at")
      ],
      usage: [
        metric("API Usage Events", String(todayUsage.length), "api_usage_logs rows created today.", "default", "available"),
        metric("Token Consumption", compactNumber(inputTokens + outputTokens), `${compactNumber(inputTokens)} input / ${compactNumber(outputTokens)} output tokens today.`, "default", todayUsage.length > 0 ? "available" : "partial"),
        metric("Estimated Daily AI Cost", formatCurrency(apiCost || taskCost), "Uses api_usage_logs first, ai_tasks cost estimates as fallback.", apiCost || taskCost ? "warning" : "default", todayUsage.length > 0 || todayTasks.length > 0 ? "available" : "partial")
      ]
    },
    acquisitionAnalytics: {
      dailyTrend: buildDailyTrend(candidates, applications, 7),
      weeklyTrend: buildWeeklyTrend(candidates, applications, 4),
      monthlyTrend: buildMonthlyTrend(candidates, applications, 3),
      sourcePerformance: buildSourceRows(sources, scans),
      topSources: buildSourceRows(sources, scans).slice(0, 5)
    },
    reliability: {
      health: [
        metric("Health Checks", queryErrors.length === 0 ? "Healthy" : "Degraded", queryErrors.length === 0 ? "All dashboard source queries returned successfully." : `${queryErrors.length} source query issue(s) detected.`, queryErrors.length === 0 ? "success" : "warning", "available"),
        metric("Error Rate", `${errorRate}%`, `${failedExecutions} failed tracked jobs out of ${totalExecutions} today.`, errorRate >= 10 ? "danger" : errorRate > 0 ? "warning" : "success", "available"),
        metric("Failed Jobs", String(failedExecutions), "Failed AI tasks, acquisition jobs, scans, and workflow traces today.", failedExecutions > 0 ? "warning" : "success", "available"),
        metric("Cron Execution History", String(todayScans.length + discoveryRuns.filter((row) => inWindow(row.started_at, todayStart)).length), "Tracked source scans and discovery runs today; raw Vercel cron logs are not persisted.", "default", "partial")
      ],
      events: reliabilityEvents
    },
    security: [
      ...unsupported,
      metric("Security Audit Events", String(auditLogs.length), "Production audit log rows in the last 30 days.", "default", "partial")
    ],
    unavailableMetrics: unsupported
  };
}

async function collect<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<QueryResult<T>> {
  const { data, error } = await query;
  return {
    data: data ?? [],
    error: error?.message ?? null
  };
}

function metric(label: string, value: string, detail: string, tone: MetricTone, availability: MetricAvailability): FounderMetric {
  return { label, value, detail, tone, availability };
}

function queueRow<T extends { status: string; created_at: string; completed_at?: string | null; sent_at?: string | null }>(
  label: string,
  rows: T[],
  fallbackDateKey: keyof T
): FounderQueueRow {
  const successRows = rows.filter((row) => row.status === "completed" || row.status === "sent");
  const failureRows = rows.filter((row) => row.status === "failed" || row.status === "blocked");

  return {
    label,
    queued: rows.filter((row) => row.status === "queued" || row.status === "pending_approval").length,
    running: rows.filter((row) => row.status === "running" || row.status === "sending" || row.status === "started").length,
    failed: rows.filter((row) => row.status === "failed").length,
    blocked: rows.filter((row) => row.status === "blocked").length,
    lastSuccessAt: newest(successRows.map((row) => row.completed_at ?? row.sent_at ?? String(row[fallbackDateKey]))),
    lastFailureAt: newest(failureRows.map((row) => String(row[fallbackDateKey])))
  };
}

function buildSourceRows(sources: SourceRow[], scans: SourceScanRow[]): FounderSourceRow[] {
  return sources
    .map((source) => {
      const sourceScans = scans.filter((scan) => scan.source_id === source.id);
      const discovered = sum(sourceScans.map((scan) => scan.extracted_businesses)) || source.extracted_business_count;
      const verified = sum(sourceScans.map((scan) => scan.verified_businesses)) || source.test_businesses_validated;
      const conversionRate = discovered > 0 ? Math.round((verified / discovered) * 100) : 0;

      return {
        sourceName: source.source_name,
        industry: source.industry,
        state: source.state ?? "Multi-state",
        status: `${source.approval_status} / ${source.health_status}`,
        discovered,
        verified,
        successRate: Math.round(source.success_rate),
        conversionRate,
        lastScannedAt: source.last_scanned_at
      };
    })
    .sort((a, b) => b.verified - a.verified || b.successRate - a.successRate);
}

function buildReliabilityEvents(
  scans: SourceScanRow[],
  discoveryRuns: DiscoveryRunRow[],
  jobs: AcquisitionJobRow[],
  tasks: AiTaskRow[],
  traces: WorkflowTraceRow[],
  emails: EmailQueueRow[]
): FounderReliabilityEvent[] {
  const events: FounderReliabilityEvent[] = [];

  events.push(
    ...scans
      .filter((row) => row.status === "failed" || row.robots_blocked)
      .slice(0, 4)
      .map((row) => ({
        label: "Source scan",
        status: row.robots_blocked ? "robots_blocked" : row.status,
        detail: row.error_message ?? `${row.extracted_businesses} discovered / ${row.verified_businesses} verified`,
        occurredAt: row.completed_at ?? row.started_at,
        tone: row.robots_blocked ? "warning" as MetricTone : "danger" as MetricTone
      }))
  );

  events.push(
    ...discoveryRuns
      .filter((row) => row.status === "failed" || row.blocked_or_unreachable > 0)
      .slice(0, 3)
      .map((row) => ({
        label: "Source discovery",
        status: row.status,
        detail: row.errors.length > 0 ? row.errors.join("; ") : `${row.blocked_or_unreachable} blocked or unreachable sources`,
        occurredAt: row.completed_at ?? row.started_at,
        tone: row.status === "failed" ? "danger" as MetricTone : "warning" as MetricTone
      }))
  );

  events.push(
    ...jobs
      .filter((row) => row.status === "failed" || row.status === "blocked")
      .slice(0, 4)
      .map((row) => ({
        label: `Acquisition job: ${row.job_type}`,
        status: row.status,
        detail: row.error_message ?? row.result_summary ?? "No failure detail recorded.",
        occurredAt: row.completed_at ?? row.created_at,
        tone: row.status === "failed" ? "danger" as MetricTone : "warning" as MetricTone
      }))
  );

  events.push(
    ...tasks
      .filter((row) => row.status === "failed" || row.status === "blocked")
      .slice(0, 4)
      .map((row) => ({
        label: `AI task: ${row.task_type}`,
        status: row.status,
        detail: row.error_message ?? "No failure detail recorded.",
        occurredAt: row.completed_at ?? row.created_at,
        tone: row.status === "failed" ? "danger" as MetricTone : "warning" as MetricTone
      }))
  );

  events.push(
    ...traces
      .filter((row) => row.status === "failed")
      .slice(0, 3)
      .map((row) => ({
        label: `${row.workflow_key} / ${row.step_key}`,
        status: row.status,
        detail: row.error_message ?? "No workflow error detail recorded.",
        occurredAt: row.completed_at ?? row.created_at,
        tone: "danger" as MetricTone
      }))
  );

  events.push(
    ...emails
      .filter((row) => row.status === "failed")
      .slice(0, 3)
      .map((row) => ({
        label: "Email delivery",
        status: row.status,
        detail: row.last_error ?? "No SendGrid error detail recorded.",
        occurredAt: row.updated_at,
        tone: "danger" as MetricTone
      }))
  );

  return events.sort((a, b) => new Date(b.occurredAt ?? 0).getTime() - new Date(a.occurredAt ?? 0).getTime()).slice(0, 10);
}

function buildDailyTrend(candidates: CandidateRow[], applications: ApplicationRow[], days: number): FounderTrendRow[] {
  return Array.from({ length: days }, (_, index) => {
    const day = addDays(startOfDay(new Date()), index - (days - 1));
    const next = addDays(day, 1);
    return trendRow(day.toLocaleDateString("en-US", { month: "short", day: "numeric" }), day, next, candidates, applications);
  });
}

function buildWeeklyTrend(candidates: CandidateRow[], applications: ApplicationRow[], weeks: number): FounderTrendRow[] {
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(startOfWeek(new Date()), (index - (weeks - 1)) * 7);
    const end = addDays(start, 7);
    return trendRow(`Week of ${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, start, end, candidates, applications);
  });
}

function buildMonthlyTrend(candidates: CandidateRow[], applications: ApplicationRow[], months: number): FounderTrendRow[] {
  return Array.from({ length: months }, (_, index) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1) + index, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return trendRow(start.toLocaleDateString("en-US", { month: "short", year: "numeric" }), start, end, candidates, applications);
  });
}

function trendRow(
  label: string,
  start: Date,
  end: Date,
  candidates: CandidateRow[],
  applications: ApplicationRow[]
): FounderTrendRow {
  const periodCandidates = candidates.filter((row) => inRange(row.created_at, start, end));
  return {
    label,
    discovered: periodCandidates.length,
    qualified: periodCandidates.filter(isQualifiedCandidate).length,
    imported: periodCandidates.filter((row) => row.import_review_status === "imported").length,
    applications: applications.filter((row) => inRange(row.created_at, start, end)).length
  };
}

function isQualifiedCandidate(row: CandidateRow) {
  return row.website_verified && row.phone_verified && row.identity_match && row.quality_score >= 80;
}

function newest(values: Array<string | null | undefined>) {
  const valid = values.filter(Boolean).map((value) => String(value));
  if (valid.length === 0) return null;
  return valid.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  return start;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function inWindow(value: string | null | undefined, start: Date) {
  if (!value) return false;
  return new Date(value).getTime() >= start.getTime();
}

function inRange(value: string | null | undefined, start: Date, end: Date) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= start.getTime() && time < end.getTime();
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 0
  }).format(value);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
