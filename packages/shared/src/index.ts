export type LeadTier = "A" | "B" | "C" | "D";

export type LeadStatus =
  | "raw"
  | "enriched"
  | "scored"
  | "qualified"
  | "nurture"
  | "archived"
  | "distributed"
  | "pending_approval"
  | "rejected_distribution"
  | "blacklisted"
  | "qualification_error"
  | "reviewing"
  | "submitted"
  | "approved"
  | "funded"
  | "rejected"
  | "reviewed"
  | "routed";

export type DeliveryStatus = "pending" | "delivered" | "failed";
export type InvoiceStatus = "draft" | "sent" | "paid";
export type ActorType = "system" | "founder" | "n8n_workflow";
export type EntityType =
  | "lead"
  | "lender"
  | "distribution"
  | "prompt"
  | "outreach"
  | "manager_agent"
  | "acquisition"
  | "campaign"
  | "simulation"
  | "diagnostics"
  | "business_application"
  | "ai_task"
  | "lender_match"
  | "funding_offer"
  | "document";
export type AlertSeverity = "INFO" | "WARN" | "CRITICAL";
export type ApiService = "anthropic" | "openai" | "apollo" | "sendgrid" | "stripe";
export type SuppressionType = "email" | "domain" | "business_name" | "apollo_id" | "phone";
export type AddedBy = "system" | "founder";
export type ManagerAgentRunStatus = "queued" | "running" | "completed" | "failed";
export type ManagerAgentTaskStatus = "assigned" | "in_progress" | "completed" | "failed" | "cancelled";
export type ManagerAgentPriority = "low" | "medium" | "high" | "urgent";
export type AgentDepartmentType =
  | "executive"
  | "operations"
  | "sales"
  | "marketing"
  | "support"
  | "success"
  | "finance"
  | "compliance"
  | "analytics";
export type AgentRoleType = "executive_manager" | "department_manager" | "specialist";
export type AgentRuntimeStatus = "active" | "paused" | "disabled";
export type AgentQueueStatus = "queued" | "assigned" | "running" | "blocked" | "completed" | "failed" | "cancelled";
export type AgentMessageType = "handoff" | "status_update" | "question" | "answer" | "escalation" | "summary";
export type AgentMemoryScope = "global" | "department" | "agent" | "workflow" | "entity";
export type AgentApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type ExecutiveReportType = "daily" | "weekly" | "incident" | "manual";
export type LeadSourceType = "apollo" | "google_maps" | "directory" | "website" | "manual_upload" | "n8n" | "api";
export type AcquisitionJobType =
  | "business_discovery"
  | "lead_ingestion"
  | "enrichment"
  | "contact_extraction"
  | "deduplication"
  | "quality_scoring"
  | "outreach_prep";
export type AcquisitionJobStatus = "queued" | "running" | "completed" | "failed" | "blocked" | "cancelled";
export type EnrichmentStatus = "queued" | "running" | "completed" | "failed" | "skipped";
export type OutreachCampaignStatus = "draft" | "pending_approval" | "active" | "paused" | "completed" | "archived";
export type OutreachEmailStatus = "queued" | "pending_approval" | "sending" | "sent" | "failed" | "cancelled" | "skipped";
export type ReplyClassification = "positive" | "neutral" | "negative" | "question" | "opt_out" | "bounce" | "unknown";
export type SimulationRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type SimulationMode = "standard" | "stress" | "replay";
export type SimulationLeadStatus =
  | "generated"
  | "ingested"
  | "enriched"
  | "qualified"
  | "approval_routed"
  | "matched"
  | "outreach_prepared"
  | "failed";
export type AcquisitionProviderStatus = "enabled" | "disabled" | "degraded" | "not_configured";
export type WorkflowTraceStatus = "started" | "completed" | "failed" | "skipped" | "retried";
export type DiagnosticHealthStatus = "healthy" | "degraded" | "critical" | "unknown";
export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "ai_review"
  | "qualified"
  | "needs_review"
  | "matched"
  | "funded"
  | "declined"
  | "withdrawn";
export type CreditScoreRange = "under_550" | "550_599" | "600_649" | "650_699" | "700_plus" | "unknown";
export type FundingProductType = "mca" | "business_loan" | "line_of_credit" | "equipment_financing" | "unknown";
export type NotificationChannel = "email" | "in_app" | "sms" | "webhook";
export type NotificationStatus = "queued" | "sent" | "failed" | "read" | "archived";
export type CrmActivityType = "note" | "call" | "email" | "status_change" | "document_request" | "lender_update";
export type UnderwritingReviewStatus = "queued" | "in_review" | "approved" | "needs_information" | "declined" | "escalated";
export type AppRole = "customer" | "staff" | "supervisor" | "founder";
export type BusinessApplicationStatus =
  | "raw"
  | "draft"
  | "submitted"
  | "ai_review"
  | "qualified"
  | "reviewing"
  | "reviewed"
  | "submitted_to_lender"
  | "routed"
  | "approved"
  | "funded"
  | "rejected"
  | "withdrawn";
export type AiTaskStatus = "queued" | "running" | "completed" | "failed" | "blocked";
export type AiTaskType =
  | "lead_qualification"
  | "lead_extraction"
  | "underwriting_summary"
  | "lender_recommendation"
  | "outreach_preparation"
  | "reporting"
  | "customer_support"
  | "crm_activity"
  | "executive_summary";
export type LenderMatchStatus = "recommended" | "approved" | "submitted" | "accepted" | "rejected" | "funded";
export type DocumentStatus = "requested" | "uploaded" | "verified" | "rejected";
export type FundingOfferStatus = "draft" | "presented" | "accepted" | "declined" | "expired";
export type ApprovalStatusType = "pending" | "approved" | "rejected" | "cancelled";

export type Lead = {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  state: string | null;
  annual_revenue_est: number | null;
  time_in_business_years: number | null;
  apollo_id: string | null;
  qualification_score: number | null;
  tier: LeadTier | null;
  status: LeadStatus;
  outreach_started: boolean;
  outreach_paused: boolean;
  blacklisted: boolean;
  distribution_approved_at: string | null;
  processing_error: boolean;
  processing_error_detail: string | null;
  distributed_at: string | null;
  is_test_data: boolean;
  simulation_run_id: string | null;
  business_application_id?: string | null;
  requested_amount?: number | null;
  monthly_deposits?: number | null;
  funding_purpose?: string | null;
  ai_summary?: string | null;
  internal_notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type Lender = {
  id: string;
  company_name: string;
  contact_email: string | null;
  webhook_url: string | null;
  criteria_industries: string[] | null;
  criteria_min_revenue: number | null;
  criteria_max_revenue: number | null;
  price_per_lead: number | null;
  active: boolean;
  whitelisted: boolean;
  created_at: string;
};

export type OutreachHistory = {
  id: string;
  lead_id: string;
  email_number: 1 | 2 | 3;
  sent_at: string | null;
  opened: boolean;
  replied: boolean;
  reply_snippet: string | null;
  created_at: string;
};

export type LeadDistribution = {
  id: string;
  lead_id: string;
  lender_id: string;
  distributed_at: string | null;
  delivery_status: DeliveryStatus;
  price: number | null;
  retry_count: number;
  last_retry_at: string | null;
  created_at: string;
};

export type AuditLogEntry = {
  id: string;
  event_type: string;
  actor_type: ActorType;
  actor_id: string | null;
  entity_type: EntityType;
  entity_id: string | null;
  before_state: Json | null;
  after_state: Json | null;
  metadata: Json | null;
  ip_address: string | null;
  created_at: string;
};

export type PromptVersion = {
  id: string;
  version_number: number;
  label: string | null;
  system_prompt: string;
  user_prompt_template: string;
  scoring_weights: Json | null;
  active: boolean;
  created_at: string;
  created_by: string | null;
  notes: string | null;
};

export type PromptTestResult = {
  id: string;
  prompt_version_id: string;
  lead_id: string | null;
  score_produced: number | null;
  tier_produced: LeadTier | null;
  reason_produced: string | null;
  latency_ms: number | null;
  created_at: string;
};

export type Alert = {
  id: string;
  severity: AlertSeverity;
  alert_type: string;
  message: string;
  context: Json | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type ApiUsageLog = {
  id: string;
  service: ApiService;
  operation: string | null;
  lead_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  success: boolean | null;
  latency_ms: number | null;
  created_at: string;
};

export type ManagerAgentRun = {
  id: string;
  objective: string;
  context: Json | null;
  status: ManagerAgentRunStatus;
  manager_model: string | null;
  final_summary: string | null;
  error_message: string | null;
  requested_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type ManagerAgentTask = {
  id: string;
  run_id: string;
  agent_id: string;
  agent_name: string;
  title: string;
  instructions: string;
  priority: ManagerAgentPriority;
  status: ManagerAgentTaskStatus;
  result_summary: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type AgentDefinition = {
  id: string;
  name: string;
  department: AgentDepartmentType;
  role: AgentRoleType;
  manager_id: string | null;
  purpose: string;
  owns: string[];
  constraints: string[];
  tools: string[];
  escalation_triggers: string[];
};

export type ManagerAssignment = {
  agent_id: string;
  title: string;
  instructions: string;
  priority: ManagerAgentPriority;
};

export type ManagerPlan = {
  summary: string;
  assignments: ManagerAssignment[];
};

export type AgentDepartment = {
  id: string;
  department_key: string;
  name: string;
  type: AgentDepartmentType;
  manager_agent_key: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AgentRecord = {
  id: string;
  department_key: string | null;
  agent_key: string;
  name: string;
  role: AgentRoleType;
  manager_agent_key: string | null;
  purpose: string;
  owns: Json;
  constraints: Json;
  tools: Json;
  escalation_triggers: Json;
  status: AgentRuntimeStatus;
  created_at: string;
  updated_at: string;
};

export type AgentTaskQueueItem = {
  id: string;
  run_id: string | null;
  workflow_key: string | null;
  parent_task_id: string | null;
  assigned_agent_key: string;
  department_key: string;
  title: string;
  instructions: string;
  context: Json | null;
  priority: ManagerAgentPriority;
  status: AgentQueueStatus;
  requires_approval: boolean;
  approval_id: string | null;
  result_summary: string | null;
  error_message: string | null;
  cost_estimate_usd: number | null;
  due_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type AgentMessage = {
  id: string;
  task_id: string | null;
  from_agent_key: string;
  to_agent_key: string;
  message_type: AgentMessageType;
  subject: string;
  body: string;
  context: Json | null;
  read_at: string | null;
  created_at: string;
};

export type AgentMemoryItem = {
  id: string;
  scope: AgentMemoryScope;
  scope_key: string;
  memory_key: string;
  memory_value: Json;
  source_task_id: string | null;
  confidence: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentSharedContext = {
  id: string;
  context_key: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Json;
  created_by_agent_key: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowRoute = {
  id: string;
  workflow_key: string;
  name: string;
  trigger_type: string;
  department_key: string;
  primary_agent_key: string;
  fallback_agent_key: string | null;
  requires_approval: boolean;
  approval_policy: Json | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AgentApprovalRequest = {
  id: string;
  task_id: string | null;
  approval_type: string;
  requested_by_agent_key: string;
  assigned_to: string | null;
  title: string;
  details: Json;
  status: AgentApprovalStatus;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentPerformanceMetric = {
  id: string;
  agent_key: string;
  department_key: string;
  metric_date: string;
  tasks_completed: number;
  tasks_failed: number;
  avg_latency_ms: number | null;
  estimated_cost_usd: number;
  success_rate: number | null;
  metadata: Json | null;
  created_at: string;
};

export type ExecutiveReport = {
  id: string;
  report_type: ExecutiveReportType;
  period_start: string;
  period_end: string;
  summary: string;
  kpis: Json;
  department_summaries: Json;
  alerts: Json;
  approvals_required: Json;
  ai_activity_summary: Json;
  generated_by_agent_key: string | null;
  created_at: string;
};

export type LeadSource = {
  id: string;
  source_key: string;
  name: string;
  source_type: LeadSourceType;
  description: string | null;
  config: Json;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type BusinessContact = {
  id: string;
  lead_id: string | null;
  source_id: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  confidence_score: number | null;
  is_primary: boolean;
  source_record_id: string | null;
  raw_payload: Json;
  is_test_data: boolean;
  created_at: string;
  updated_at: string;
};

export type LeadEnrichmentRecord = {
  id: string;
  lead_id: string;
  source_id: string | null;
  status: EnrichmentStatus;
  provider: string | null;
  normalized_business_name: string | null;
  website_url: string | null;
  domain: string | null;
  industry: string | null;
  employee_count: number | null;
  annual_revenue_est: number | null;
  funding_signals: Json;
  contact_confidence_score: number | null;
  quality_score: number | null;
  duplicate_group_key: string | null;
  raw_payload: Json;
  error_message: string | null;
  enriched_at: string | null;
  is_test_data: boolean;
  created_at: string;
  updated_at: string;
};

export type AcquisitionJob = {
  id: string;
  source_id: string | null;
  job_type: AcquisitionJobType;
  status: AcquisitionJobStatus;
  requested_by: string | null;
  assigned_agent_key: string | null;
  approval_id: string | null;
  parameters: Json;
  counts: Json;
  result_summary: string | null;
  error_message: string | null;
  is_test_data: boolean;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type OutreachCampaign = {
  id: string;
  name: string;
  description: string | null;
  status: OutreachCampaignStatus;
  audience_filter: Json;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  is_test_data: boolean;
  created_at: string;
  updated_at: string;
};

export type OutreachSequence = {
  id: string;
  campaign_id: string;
  step_number: number;
  delay_hours: number;
  subject_template: string;
  body_template: string;
  channel: string;
  send_window: Json;
  requires_approval: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type OutreachEmailQueueItem = {
  id: string;
  campaign_id: string | null;
  sequence_id: string | null;
  lead_id: string;
  contact_id: string | null;
  to_email: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  status: OutreachEmailStatus;
  scheduled_at: string;
  sent_at: string | null;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  provider_message_id: string | null;
  approval_id: string | null;
  ai_generated: boolean;
  created_by_agent_key: string | null;
  is_test_data: boolean;
  created_at: string;
  updated_at: string;
};

export type OutreachReply = {
  id: string;
  campaign_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  provider_message_id: string | null;
  from_email: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  classification: ReplyClassification;
  intent_score: number | null;
  sentiment: string | null;
  requires_follow_up: boolean;
  escalated: boolean;
  raw_payload: Json;
  is_test_data: boolean;
  created_at: string;
  updated_at: string;
};

export type AcquisitionSummary = {
  sources: number;
  active_sources: number;
  jobs: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    blocked: number;
  };
  leads: {
    total: number;
    enriched: number;
    qualified: number;
    pending_approval: number;
  };
  contacts: number;
  average_quality_score: number;
  outreach: {
    campaigns: number;
    active_campaigns: number;
    queued_emails: number;
    pending_approval_emails: number;
    sent_emails: number;
    replies: number;
    positive_replies: number;
  };
};

export type SimulationRun = {
  id: string;
  run_key: string;
  name: string;
  mode: SimulationMode;
  status: SimulationRunStatus;
  batch_size: 10 | 100 | 1000 | 10000;
  industries: string[];
  config: Json;
  counts: Json;
  requested_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type SimulationLeadRecord = {
  id: string;
  simulation_run_id: string;
  lead_id: string | null;
  generated_index: number;
  business_name: string;
  owner_name: string;
  email: string;
  phone: string;
  industry: string;
  revenue_estimate: number;
  funding_need: number;
  risk_profile: "low" | "medium" | "high" | "watchlist";
  source_payload: Json;
  pipeline_stage: string;
  status: SimulationLeadStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type AcquisitionProvider = {
  id: string;
  provider_key: string;
  display_name: string;
  source_type: LeadSourceType;
  enabled: boolean;
  status: AcquisitionProviderStatus;
  capabilities: string[];
  config: Json;
  failure_count: number;
  last_latency_ms: number | null;
  last_error: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowExecutionTrace = {
  id: string;
  simulation_run_id: string | null;
  workflow_key: string;
  step_key: string;
  entity_type: string | null;
  entity_id: string | null;
  status: WorkflowTraceStatus;
  attempt: number;
  latency_ms: number | null;
  input: Json;
  output: Json;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export type WorkerControlState = {
  control_key: string;
  workers_paused: boolean;
  stress_mode_enabled: boolean;
  reason: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type DiagnosticSnapshot = {
  id: string;
  snapshot_type: string;
  health_status: DiagnosticHealthStatus;
  metrics: Json;
  bottlenecks: Json;
  recommendations: Json;
  created_at: string;
};

export type ProductionReadinessReport = {
  id: string;
  simulation_run_id: string | null;
  status: DiagnosticHealthStatus;
  stable_systems: Json;
  unstable_systems: Json;
  scaling_bottlenecks: Json;
  required_integrations: Json;
  next_recommended_phase: string;
  report_body: string;
  created_by: string | null;
  created_at: string;
};

export type PublicUser = {
  id: string;
  auth_user_id?: string | null;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: AppRole;
  company_name: string | null;
  title: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessApplication = {
  id: string;
  user_id: string | null;
  profile_id: string | null;
  business_id: string | null;
  lead_id: string | null;
  status: BusinessApplicationStatus;
  business_name: string;
  industry: string;
  state: string | null;
  website_url: string | null;
  annual_revenue: number | null;
  monthly_revenue: number | null;
  monthly_deposits: number;
  requested_amount: number;
  product_type: FundingProductType;
  credit_score_range: CreditScoreRange;
  owner_name: string;
  contact_email: string;
  contact_phone: string;
  ownership_percentage: number | null;
  bank_name: string | null;
  average_daily_balance: number | null;
  funding_purpose: string | null;
  consent_to_contact: boolean;
  progress_step: number;
  metadata: Json;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

export type Business = {
  id: string;
  user_id: string | null;
  business_name: string;
  industry: string;
  website_url: string | null;
  state: string | null;
  annual_revenue: number | null;
  monthly_deposits: number | null;
  time_in_business_months: number | null;
  tax_id_last4: string | null;
  created_at: string;
  updated_at: string;
};

export type FundingApplication = {
  id: string;
  user_id: string | null;
  business_id: string;
  lead_id: string | null;
  status: ApplicationStatus;
  product_type: FundingProductType;
  requested_amount: number;
  monthly_revenue: number | null;
  monthly_deposits: number;
  credit_score_range: CreditScoreRange;
  owner_name: string;
  contact_email: string;
  contact_phone: string;
  funding_purpose: string | null;
  consent_to_contact: boolean;
  metadata: Json;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

export type AiQualificationLog = {
  id: string;
  application_id: string | null;
  lead_id: string | null;
  provider: string;
  model: string | null;
  score: number | null;
  tier: LeadTier | null;
  decision: string | null;
  reason: string | null;
  input_payload: Json;
  output_payload: Json;
  latency_ms: number | null;
  created_at: string;
};

export type LeadScore = {
  id: string;
  lead_id: string;
  business_application_id: string | null;
  score: number;
  tier: LeadTier | null;
  decision: string;
  industry_risk: string | null;
  funding_fit: string | null;
  underwriting_summary: string | null;
  lender_recommendations: Json;
  internal_notes: string | null;
  model: string | null;
  provider: string;
  input_payload: Json;
  output_payload: Json;
  created_at: string;
};

export type LenderMatch = {
  id: string;
  lead_id: string;
  lender_id: string;
  business_application_id: string | null;
  match_score: number | null;
  status: LenderMatchStatus;
  criteria_snapshot: Json;
  submitted_at: string | null;
  decision_at: string | null;
  commission_estimate: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OutreachLog = {
  id: string;
  campaign_id: string | null;
  lead_id: string | null;
  business_application_id: string | null;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  status: string;
  provider: string | null;
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  metadata: Json;
  created_at: string;
};

export type AiTask = {
  id: string;
  task_type: AiTaskType;
  status: AiTaskStatus;
  priority: string;
  lead_id: string | null;
  business_application_id: string | null;
  assigned_agent: string;
  input_payload: Json;
  result_payload: Json;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  cost_estimate_usd: number | null;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AiTaskLog = {
  id: string;
  ai_task_id: string;
  status: AiTaskStatus;
  message: string;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  cost_estimate_usd: number | null;
  metadata: Json;
  created_at: string;
};

export type NotificationRecord = {
  id: string;
  user_id: string | null;
  application_id: string | null;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  message: string;
  action_url: string | null;
  metadata: Json;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmActivity = {
  id: string;
  application_id: string | null;
  business_id: string | null;
  lead_id: string | null;
  actor_id: string | null;
  actor_type: string;
  activity_type: CrmActivityType;
  subject: string;
  body: string | null;
  metadata: Json;
  created_at: string;
};

export type UnderwritingReview = {
  id: string;
  application_id: string | null;
  lead_id?: string | null;
  business_application_id?: string | null;
  ai_task_id?: string | null;
  assigned_to: string | null;
  status: UnderwritingReviewStatus;
  risk_score: number | null;
  qualification_score?: number | null;
  industry_risk?: string | null;
  funding_recommendation: string | null;
  requested_documents: Json;
  notes: string | null;
  ai_summary: string | null;
  lender_recommendations?: Json;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentRecord = {
  id: string;
  user_id: string | null;
  business_application_id: string | null;
  lead_id: string | null;
  document_type: string;
  file_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  status: DocumentStatus;
  uploaded_at: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FundingOffer = {
  id: string;
  business_application_id: string;
  lead_id: string | null;
  lender_id: string | null;
  amount: number;
  factor_rate: number | null;
  term_months: number | null;
  repayment_frequency: string | null;
  estimated_payment: number | null;
  status: FundingOfferStatus;
  presented_at: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type ApprovalStatus = {
  id: string;
  entity_type: string;
  entity_id: string;
  requested_by: string | null;
  assigned_to: string | null;
  status: ApprovalStatusType;
  reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type ProductionAuditLog = {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_role: string | null;
  entity_type: string;
  entity_id: string | null;
  before_state: Json | null;
  after_state: Json | null;
  metadata: Json;
  ip_address: string | null;
  created_at: string;
};

export type ApiUsageEvent = {
  id: string;
  service: string;
  operation: string;
  lead_id: string | null;
  business_application_id: string | null;
  ai_task_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  success: boolean;
  latency_ms: number | null;
  error_message: string | null;
  metadata: Json;
  created_at: string;
};

export type DiagnosticsSummary = {
  health_status: DiagnosticHealthStatus;
  worker_health: {
    paused: boolean;
    stress_mode_enabled: boolean;
    running_tasks: number;
    failed_tasks: number;
  };
  queue_health: {
    acquisition_queued: number;
    outreach_queued: number;
    approvals_pending: number;
    retries_pending: number;
  };
  latency: {
    supabase_ms: number | null;
    ai_provider_ms: number | null;
  };
  failures: {
    api_failures: number;
    enrichment_failures: number;
    workflow_failures: number;
  };
  bottlenecks: string[];
  recommendations: string[];
};

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type QualificationResult = {
  score: number;
  tier: LeadTier;
  reason: string;
  promptVersionId?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type PaginatedResult<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
};
