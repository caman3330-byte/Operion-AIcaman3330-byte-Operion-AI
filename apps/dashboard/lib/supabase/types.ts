import type {
  Alert,
  AlertSeverity,
  AcquisitionJob,
  AcquisitionJobStatus,
  AcquisitionJobType,
  AcquisitionProvider,
  AcquisitionProviderStatus,
  AiTask,
  AiTaskLog,
  AiTaskStatus,
  AiTaskType,
  AiQualificationLog,
  AgentApprovalRequest,
  AgentDepartment,
  AgentMemoryItem,
  AgentMessage,
  AgentPerformanceMetric,
  AgentRecord,
  AgentSharedContext,
  AgentTaskQueueItem,
  ApiService,
  ApiUsageLog,
  ApiUsageEvent,
  AppRole,
  ApprovalStatus,
  ApprovalStatusType,
  AuditLogEntry,
  Business,
  BusinessApplication,
  BusinessApplicationStatus,
  BusinessContact,
  CreditScoreRange,
  CrmActivity,
  CrmActivityType,
  DiagnosticSnapshot,
  DiagnosticHealthStatus,
  DeliveryStatus,
  DocumentRecord,
  DocumentStatus,
  EnrichmentStatus,
  ExecutiveReport,
  FundingOffer,
  FundingOfferStatus,
  FundingApplication,
  FundingProductType,
  InvoiceStatus,
  Json,
  Lead,
  LeadDistribution,
  LeadEnrichmentRecord,
  LeadScore,
  LeadSource,
  LeadSourceType,
  LeadStatus,
  LeadTier,
  MerchantAcquisitionSource,
  MerchantAcquisitionSourceScan,
  MerchantSourceHealthStatus,
  MerchantSourceType,
  Lender,
  LenderMatch,
  LenderMatchStatus,
  ManagerAgentRun,
  ManagerAgentTask,
  NotificationChannel,
  NotificationRecord,
  NotificationStatus,
  OutreachLog,
  OutreachCampaign,
  OutreachCampaignStatus,
  OutreachEmailQueueItem,
  OutreachEmailStatus,
  OutreachHistory,
  OutreachReply,
  OutreachSequence,
  PromptTestResult,
  PromptVersion,
  ProductionReadinessReport,
  ProductionAuditLog,
  Profile,
  PublicUser,
  ReplyClassification,
  SimulationLeadRecord,
  SimulationLeadStatus,
  SimulationMode,
  SimulationRun,
  SimulationRunStatus,
  WorkflowExecutionTrace,
  WorkflowTraceStatus,
  WorkerControlState,
  UnderwritingReview,
  UnderwritingReviewStatus,
  WorkflowRoute
} from "@operion/shared";

type LoosePartial<T> = {
  [K in keyof T]?: T[K] | undefined;
};

export type LeadInsert = LoosePartial<Omit<Lead, "id" | "created_at" | "updated_at">> & Pick<Lead, "business_name">;
export type LeadUpdate = LoosePartial<Omit<Lead, "id" | "created_at">>;

export type LenderInsert = LoosePartial<Omit<Lender, "id" | "created_at">> & Pick<Lender, "company_name">;
export type LenderUpdate = LoosePartial<Omit<Lender, "id" | "created_at">>;

export type OutreachHistoryInsert = LoosePartial<Omit<OutreachHistory, "id" | "created_at">> & Pick<OutreachHistory, "lead_id" | "email_number">;
export type OutreachHistoryUpdate = LoosePartial<Omit<OutreachHistory, "id" | "created_at" | "lead_id" | "email_number">>;
export type LeadDistributionInsert = LoosePartial<Omit<LeadDistribution, "id" | "created_at">> & Pick<LeadDistribution, "lead_id" | "lender_id">;
export type LeadDistributionUpdate = LoosePartial<Omit<LeadDistribution, "id" | "created_at" | "lead_id" | "lender_id">>;
export type AuditLogInsert = LoosePartial<Omit<AuditLogEntry, "id" | "created_at">> &
  Pick<AuditLogEntry, "event_type" | "actor_type" | "entity_type">;
export type PromptVersionInsert = LoosePartial<Omit<PromptVersion, "id" | "created_at" | "version_number">> &
  Pick<PromptVersion, "system_prompt" | "user_prompt_template">;
export type PromptTestResultInsert = LoosePartial<Omit<PromptTestResult, "id" | "created_at">> &
  Pick<PromptTestResult, "prompt_version_id">;
export type AlertInsert = LoosePartial<Omit<Alert, "id" | "created_at">> & Pick<Alert, "severity" | "alert_type" | "message">;
export type AlertUpdate = LoosePartial<Omit<Alert, "id" | "created_at">>;
export type ApiUsageLogInsert = LoosePartial<Omit<ApiUsageLog, "id" | "created_at">> & Pick<ApiUsageLog, "service">;
export type ManagerAgentRunInsert = LoosePartial<Omit<ManagerAgentRun, "id" | "created_at" | "updated_at">> &
  Pick<ManagerAgentRun, "objective">;
export type ManagerAgentRunUpdate = LoosePartial<Omit<ManagerAgentRun, "id" | "created_at">>;
export type ManagerAgentTaskInsert = LoosePartial<Omit<ManagerAgentTask, "id" | "created_at" | "updated_at">> &
  Pick<ManagerAgentTask, "run_id" | "agent_id" | "agent_name" | "title" | "instructions">;
export type ManagerAgentTaskUpdate = LoosePartial<Omit<ManagerAgentTask, "id" | "created_at" | "run_id">>;
export type AgentDepartmentInsert = LoosePartial<Omit<AgentDepartment, "id" | "created_at" | "updated_at">> &
  Pick<AgentDepartment, "department_key" | "name" | "type">;
export type AgentDepartmentUpdate = LoosePartial<Omit<AgentDepartment, "id" | "created_at" | "department_key">>;
export type AgentRecordInsert = LoosePartial<Omit<AgentRecord, "id" | "created_at" | "updated_at">> &
  Pick<AgentRecord, "agent_key" | "name" | "role" | "purpose">;
export type AgentRecordUpdate = LoosePartial<Omit<AgentRecord, "id" | "created_at" | "agent_key">>;
export type AgentTaskQueueInsert = LoosePartial<Omit<AgentTaskQueueItem, "id" | "created_at" | "updated_at">> &
  Pick<AgentTaskQueueItem, "assigned_agent_key" | "department_key" | "title" | "instructions">;
export type AgentTaskQueueUpdate = LoosePartial<Omit<AgentTaskQueueItem, "id" | "created_at">>;
export type AgentMessageInsert = LoosePartial<Omit<AgentMessage, "id" | "created_at">> &
  Pick<AgentMessage, "from_agent_key" | "to_agent_key" | "message_type" | "subject" | "body">;
export type AgentMessageUpdate = LoosePartial<Pick<AgentMessage, "read_at">>;
export type AgentMemoryInsert = LoosePartial<Omit<AgentMemoryItem, "id" | "created_at" | "updated_at">> &
  Pick<AgentMemoryItem, "scope" | "scope_key" | "memory_key" | "memory_value">;
export type AgentMemoryUpdate = LoosePartial<Omit<AgentMemoryItem, "id" | "created_at" | "scope" | "scope_key" | "memory_key">>;
export type AgentSharedContextInsert = LoosePartial<Omit<AgentSharedContext, "id" | "created_at" | "updated_at">> &
  Pick<AgentSharedContext, "context_key" | "payload">;
export type AgentSharedContextUpdate = LoosePartial<Omit<AgentSharedContext, "id" | "created_at" | "context_key">>;
export type WorkflowRouteInsert = LoosePartial<Omit<WorkflowRoute, "id" | "created_at" | "updated_at">> &
  Pick<WorkflowRoute, "workflow_key" | "name" | "trigger_type" | "department_key" | "primary_agent_key">;
export type WorkflowRouteUpdate = LoosePartial<Omit<WorkflowRoute, "id" | "created_at" | "workflow_key">>;
export type AgentApprovalRequestInsert = LoosePartial<Omit<AgentApprovalRequest, "id" | "created_at" | "updated_at">> &
  Pick<AgentApprovalRequest, "approval_type" | "requested_by_agent_key" | "title" | "details">;
export type AgentApprovalRequestUpdate = LoosePartial<Omit<AgentApprovalRequest, "id" | "created_at">>;
export type AgentPerformanceMetricInsert = LoosePartial<Omit<AgentPerformanceMetric, "id" | "created_at">> &
  Pick<AgentPerformanceMetric, "agent_key" | "department_key" | "metric_date">;
export type ExecutiveReportInsert = LoosePartial<Omit<ExecutiveReport, "id" | "created_at">> &
  Pick<ExecutiveReport, "report_type" | "period_start" | "period_end" | "summary">;
export type LeadSourceInsert = LoosePartial<Omit<LeadSource, "id" | "created_at" | "updated_at">> &
  Pick<LeadSource, "source_key" | "name" | "source_type">;
export type LeadSourceUpdate = LoosePartial<Omit<LeadSource, "id" | "created_at" | "source_key">>;
export type MerchantAcquisitionSourceInsert = LoosePartial<Omit<MerchantAcquisitionSource, "id" | "created_at" | "updated_at">> &
  Pick<MerchantAcquisitionSource, "source_url" | "source_name" | "source_type" | "industry">;
export type MerchantAcquisitionSourceUpdate = LoosePartial<Omit<MerchantAcquisitionSource, "id" | "created_at" | "source_url">>;
export type MerchantAcquisitionSourceScanInsert = LoosePartial<Omit<MerchantAcquisitionSourceScan, "id">> &
  Pick<MerchantAcquisitionSourceScan, "source_id">;
export type MerchantAcquisitionSourceScanUpdate = LoosePartial<Omit<MerchantAcquisitionSourceScan, "id" | "source_id">>;
export type BusinessContactInsert = LoosePartial<Omit<BusinessContact, "id" | "created_at" | "updated_at">>;
export type BusinessContactUpdate = LoosePartial<Omit<BusinessContact, "id" | "created_at">>;
export type LeadEnrichmentInsert = LoosePartial<Omit<LeadEnrichmentRecord, "id" | "created_at" | "updated_at">> &
  Pick<LeadEnrichmentRecord, "lead_id">;
export type LeadEnrichmentUpdate = LoosePartial<Omit<LeadEnrichmentRecord, "id" | "created_at" | "lead_id">>;
export type AcquisitionJobInsert = LoosePartial<Omit<AcquisitionJob, "id" | "created_at" | "updated_at">> &
  Pick<AcquisitionJob, "job_type">;
export type AcquisitionJobUpdate = LoosePartial<Omit<AcquisitionJob, "id" | "created_at">>;
export type OutreachCampaignInsert = LoosePartial<Omit<OutreachCampaign, "id" | "created_at" | "updated_at">> &
  Pick<OutreachCampaign, "name">;
export type OutreachCampaignUpdate = LoosePartial<Omit<OutreachCampaign, "id" | "created_at">>;
export type OutreachSequenceInsert = LoosePartial<Omit<OutreachSequence, "id" | "created_at" | "updated_at">> &
  Pick<OutreachSequence, "campaign_id" | "step_number" | "subject_template" | "body_template">;
export type OutreachSequenceUpdate = LoosePartial<Omit<OutreachSequence, "id" | "created_at" | "campaign_id">>;
export type OutreachEmailQueueInsert = LoosePartial<Omit<OutreachEmailQueueItem, "id" | "created_at" | "updated_at">> &
  Pick<OutreachEmailQueueItem, "lead_id" | "to_email" | "subject" | "html_body">;
export type OutreachEmailQueueUpdate = LoosePartial<Omit<OutreachEmailQueueItem, "id" | "created_at">>;
export type OutreachReplyInsert = LoosePartial<Omit<OutreachReply, "id" | "created_at" | "updated_at">> &
  Pick<OutreachReply, "from_email">;
export type OutreachReplyUpdate = LoosePartial<Omit<OutreachReply, "id" | "created_at">>;
export type SimulationRunInsert = LoosePartial<Omit<SimulationRun, "id" | "created_at" | "updated_at">> &
  Pick<SimulationRun, "run_key" | "name" | "batch_size">;
export type SimulationRunUpdate = LoosePartial<Omit<SimulationRun, "id" | "created_at" | "run_key">>;
export type SimulationLeadInsert = LoosePartial<Omit<SimulationLeadRecord, "id" | "created_at" | "updated_at">> &
  Pick<SimulationLeadRecord, "simulation_run_id" | "generated_index" | "business_name" | "owner_name" | "email" | "phone" | "industry" | "revenue_estimate" | "funding_need" | "risk_profile">;
export type SimulationLeadUpdate = LoosePartial<Omit<SimulationLeadRecord, "id" | "created_at" | "simulation_run_id">>;
export type AcquisitionProviderInsert = LoosePartial<Omit<AcquisitionProvider, "id" | "created_at" | "updated_at">> &
  Pick<AcquisitionProvider, "provider_key" | "display_name" | "source_type">;
export type AcquisitionProviderUpdate = LoosePartial<Omit<AcquisitionProvider, "id" | "created_at" | "provider_key">>;
export type WorkflowExecutionTraceInsert = LoosePartial<Omit<WorkflowExecutionTrace, "id" | "created_at">> &
  Pick<WorkflowExecutionTrace, "workflow_key" | "step_key" | "status">;
export type WorkerControlStateInsert = LoosePartial<WorkerControlState> & Pick<WorkerControlState, "control_key">;
export type WorkerControlStateUpdate = LoosePartial<Omit<WorkerControlState, "control_key">>;
export type DiagnosticSnapshotInsert = LoosePartial<Omit<DiagnosticSnapshot, "id" | "created_at">> &
  Pick<DiagnosticSnapshot, "snapshot_type" | "health_status">;
export type ProductionReadinessReportInsert = LoosePartial<Omit<ProductionReadinessReport, "id" | "created_at">> &
  Pick<ProductionReadinessReport, "status" | "next_recommended_phase" | "report_body">;
export type PublicUserInsert = LoosePartial<Omit<PublicUser, "created_at" | "updated_at">> & Pick<PublicUser, "id" | "email">;
export type PublicUserUpdate = LoosePartial<Omit<PublicUser, "id" | "created_at">>;
export type BusinessInsert = LoosePartial<Omit<Business, "id" | "created_at" | "updated_at">> & Pick<Business, "business_name" | "industry">;
export type BusinessUpdate = LoosePartial<Omit<Business, "id" | "created_at">>;
export type FundingApplicationInsert = LoosePartial<Omit<FundingApplication, "id" | "created_at" | "updated_at">> &
  Pick<FundingApplication, "business_id" | "requested_amount" | "monthly_deposits" | "credit_score_range" | "owner_name" | "contact_email" | "contact_phone">;
export type FundingApplicationUpdate = LoosePartial<Omit<FundingApplication, "id" | "created_at">>;
export type AiQualificationLogInsert = LoosePartial<Omit<AiQualificationLog, "id" | "created_at">>;
export type ProfileInsert = LoosePartial<Omit<Profile, "created_at" | "updated_at">> & Pick<Profile, "id" | "email">;
export type ProfileUpdate = LoosePartial<Omit<Profile, "id" | "created_at">>;
export type BusinessApplicationInsert = LoosePartial<Omit<BusinessApplication, "id" | "created_at" | "updated_at">> &
  Pick<
    BusinessApplication,
    "business_name" | "industry" | "monthly_deposits" | "requested_amount" | "credit_score_range" | "owner_name" | "contact_email" | "contact_phone"
  >;
export type BusinessApplicationUpdate = LoosePartial<Omit<BusinessApplication, "id" | "created_at">>;
export type LeadScoreInsert = LoosePartial<Omit<LeadScore, "id" | "created_at">> & Pick<LeadScore, "lead_id" | "score" | "decision">;
export type LenderMatchInsert = LoosePartial<Omit<LenderMatch, "id" | "created_at" | "updated_at">> &
  Pick<LenderMatch, "lead_id" | "lender_id">;
export type LenderMatchUpdate = LoosePartial<Omit<LenderMatch, "id" | "created_at" | "lead_id" | "lender_id">>;
export type OutreachLogInsert = LoosePartial<Omit<OutreachLog, "id" | "created_at">>;
export type AiTaskInsert = LoosePartial<Omit<AiTask, "id" | "created_at" | "updated_at">> & Pick<AiTask, "task_type">;
export type AiTaskUpdate = LoosePartial<Omit<AiTask, "id" | "created_at">>;
export type AiTaskLogInsert = LoosePartial<Omit<AiTaskLog, "id" | "created_at">> & Pick<AiTaskLog, "ai_task_id" | "status" | "message">;
export type DocumentInsert = LoosePartial<Omit<DocumentRecord, "id" | "created_at" | "updated_at">> &
  Pick<DocumentRecord, "document_type">;
export type DocumentUpdate = LoosePartial<Omit<DocumentRecord, "id" | "created_at">>;
export type FundingOfferInsert = LoosePartial<Omit<FundingOffer, "id" | "created_at" | "updated_at">> &
  Pick<FundingOffer, "business_application_id" | "amount">;
export type FundingOfferUpdate = LoosePartial<Omit<FundingOffer, "id" | "created_at" | "business_application_id">>;
export type ApprovalStatusInsert = LoosePartial<Omit<ApprovalStatus, "id" | "created_at" | "updated_at">> &
  Pick<ApprovalStatus, "entity_type" | "entity_id">;
export type ApprovalStatusUpdate = LoosePartial<Omit<ApprovalStatus, "id" | "created_at">>;
export type ProductionAuditLogInsert = LoosePartial<Omit<ProductionAuditLog, "id" | "created_at">> &
  Pick<ProductionAuditLog, "event_type" | "entity_type">;
export type ApiUsageEventInsert = LoosePartial<Omit<ApiUsageEvent, "id" | "created_at">> & Pick<ApiUsageEvent, "service" | "operation">;
export type NotificationInsert = LoosePartial<Omit<NotificationRecord, "id" | "created_at" | "updated_at">> &
  Pick<NotificationRecord, "title" | "message">;
export type NotificationUpdate = LoosePartial<Omit<NotificationRecord, "id" | "created_at">>;
export type CrmActivityInsert = LoosePartial<Omit<CrmActivity, "id" | "created_at">> &
  Pick<CrmActivity, "activity_type" | "subject">;
export type UnderwritingReviewInsert = LoosePartial<Omit<UnderwritingReview, "id" | "created_at" | "updated_at">>;
export type UnderwritingReviewUpdate = LoosePartial<Omit<UnderwritingReview, "id" | "created_at" | "application_id">>;

export interface Database {
  public: {
    Tables: {
      leads: {
        Row: Lead;
        Insert: LeadInsert;
        Update: LeadUpdate;
        Relationships: [];
      };
      outreach_history: {
        Row: OutreachHistory;
        Insert: OutreachHistoryInsert;
        Update: OutreachHistoryUpdate;
        Relationships: [];
      };
      lenders: {
        Row: Lender;
        Insert: LenderInsert;
        Update: LenderUpdate;
        Relationships: [];
      };
      lead_distributions: {
        Row: LeadDistribution;
        Insert: LeadDistributionInsert;
        Update: LeadDistributionUpdate;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          lender_id: string;
          period_start: string;
          period_end: string;
          lead_count: number;
          total_amount: number;
          stripe_invoice_id: string | null;
          status: InvoiceStatus;
          created_at: string;
        };
        Insert: {
          lender_id: string;
          period_start: string;
          period_end: string;
          lead_count?: number;
          total_amount?: number;
          stripe_invoice_id?: string | null;
          status?: InvoiceStatus;
        };
        Update: {
          period_start?: string;
          period_end?: string;
          lead_count?: number;
          total_amount?: number;
          stripe_invoice_id?: string | null;
          status?: InvoiceStatus;
        };
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogEntry;
        Insert: AuditLogInsert;
        Update: never;
        Relationships: [];
      };
      prompt_versions: {
        Row: PromptVersion;
        Insert: PromptVersionInsert;
        Update: LoosePartial<PromptVersionInsert>;
        Relationships: [];
      };
      prompt_test_results: {
        Row: PromptTestResult;
        Insert: PromptTestResultInsert;
        Update: LoosePartial<PromptTestResultInsert>;
        Relationships: [];
      };
      alerts: {
        Row: Alert;
        Insert: AlertInsert;
        Update: AlertUpdate;
        Relationships: [];
      };
      api_usage_log: {
        Row: ApiUsageLog;
        Insert: ApiUsageLogInsert;
        Update: never;
        Relationships: [];
      };
      suppression_list: {
        Row: {
          id: string;
          type: "email" | "domain" | "business_name" | "apollo_id" | "phone";
          value: string;
          reason: string | null;
          added_by: "system" | "founder";
          created_at: string;
        };
        Insert: {
          type: "email" | "domain" | "business_name" | "apollo_id" | "phone";
          value: string;
          reason?: string | null;
          added_by: "system" | "founder";
        };
        Update: never;
        Relationships: [];
      };
      manager_agent_runs: {
        Row: ManagerAgentRun;
        Insert: ManagerAgentRunInsert;
        Update: ManagerAgentRunUpdate;
        Relationships: [];
      };
      manager_agent_tasks: {
        Row: ManagerAgentTask;
        Insert: ManagerAgentTaskInsert;
        Update: ManagerAgentTaskUpdate;
        Relationships: [];
      };
      agent_departments: {
        Row: AgentDepartment;
        Insert: AgentDepartmentInsert;
        Update: AgentDepartmentUpdate;
        Relationships: [];
      };
      agent_definitions: {
        Row: AgentRecord;
        Insert: AgentRecordInsert;
        Update: AgentRecordUpdate;
        Relationships: [];
      };
      agent_task_queue: {
        Row: AgentTaskQueueItem;
        Insert: AgentTaskQueueInsert;
        Update: AgentTaskQueueUpdate;
        Relationships: [];
      };
      agent_messages: {
        Row: AgentMessage;
        Insert: AgentMessageInsert;
        Update: AgentMessageUpdate;
        Relationships: [];
      };
      agent_memory: {
        Row: AgentMemoryItem;
        Insert: AgentMemoryInsert;
        Update: AgentMemoryUpdate;
        Relationships: [];
      };
      agent_shared_context: {
        Row: AgentSharedContext;
        Insert: AgentSharedContextInsert;
        Update: AgentSharedContextUpdate;
        Relationships: [];
      };
      workflow_routes: {
        Row: WorkflowRoute;
        Insert: WorkflowRouteInsert;
        Update: WorkflowRouteUpdate;
        Relationships: [];
      };
      agent_approval_requests: {
        Row: AgentApprovalRequest;
        Insert: AgentApprovalRequestInsert;
        Update: AgentApprovalRequestUpdate;
        Relationships: [];
      };
      agent_performance_metrics: {
        Row: AgentPerformanceMetric;
        Insert: AgentPerformanceMetricInsert;
        Update: never;
        Relationships: [];
      };
      executive_reports: {
        Row: ExecutiveReport;
        Insert: ExecutiveReportInsert;
        Update: never;
        Relationships: [];
      };
      lead_sources: {
        Row: LeadSource;
        Insert: LeadSourceInsert;
        Update: LeadSourceUpdate;
        Relationships: [];
      };
      merchant_acquisition_sources: {
        Row: MerchantAcquisitionSource;
        Insert: MerchantAcquisitionSourceInsert;
        Update: MerchantAcquisitionSourceUpdate;
        Relationships: [];
      };
      merchant_acquisition_source_scans: {
        Row: MerchantAcquisitionSourceScan;
        Insert: MerchantAcquisitionSourceScanInsert;
        Update: MerchantAcquisitionSourceScanUpdate;
        Relationships: [];
      };
      business_contacts: {
        Row: BusinessContact;
        Insert: BusinessContactInsert;
        Update: BusinessContactUpdate;
        Relationships: [];
      };
      lead_enrichment: {
        Row: LeadEnrichmentRecord;
        Insert: LeadEnrichmentInsert;
        Update: LeadEnrichmentUpdate;
        Relationships: [];
      };
      acquisition_jobs: {
        Row: AcquisitionJob;
        Insert: AcquisitionJobInsert;
        Update: AcquisitionJobUpdate;
        Relationships: [];
      };
      outreach_campaigns: {
        Row: OutreachCampaign;
        Insert: OutreachCampaignInsert;
        Update: OutreachCampaignUpdate;
        Relationships: [];
      };
      outreach_sequences: {
        Row: OutreachSequence;
        Insert: OutreachSequenceInsert;
        Update: OutreachSequenceUpdate;
        Relationships: [];
      };
      outreach_email_queue: {
        Row: OutreachEmailQueueItem;
        Insert: OutreachEmailQueueInsert;
        Update: OutreachEmailQueueUpdate;
        Relationships: [];
      };
      outreach_replies: {
        Row: OutreachReply;
        Insert: OutreachReplyInsert;
        Update: OutreachReplyUpdate;
        Relationships: [];
      };
      simulation_runs: {
        Row: SimulationRun;
        Insert: SimulationRunInsert;
        Update: SimulationRunUpdate;
        Relationships: [];
      };
      simulation_leads: {
        Row: SimulationLeadRecord;
        Insert: SimulationLeadInsert;
        Update: SimulationLeadUpdate;
        Relationships: [];
      };
      acquisition_providers: {
        Row: AcquisitionProvider;
        Insert: AcquisitionProviderInsert;
        Update: AcquisitionProviderUpdate;
        Relationships: [];
      };
      workflow_execution_traces: {
        Row: WorkflowExecutionTrace;
        Insert: WorkflowExecutionTraceInsert;
        Update: never;
        Relationships: [];
      };
      worker_control_state: {
        Row: WorkerControlState;
        Insert: WorkerControlStateInsert;
        Update: WorkerControlStateUpdate;
        Relationships: [];
      };
      diagnostic_snapshots: {
        Row: DiagnosticSnapshot;
        Insert: DiagnosticSnapshotInsert;
        Update: never;
        Relationships: [];
      };
      production_readiness_reports: {
        Row: ProductionReadinessReport;
        Insert: ProductionReadinessReportInsert;
        Update: never;
        Relationships: [];
      };
      users: {
        Row: PublicUser;
        Insert: PublicUserInsert;
        Update: PublicUserUpdate;
        Relationships: [];
      };
      businesses: {
        Row: Business;
        Insert: BusinessInsert;
        Update: BusinessUpdate;
        Relationships: [];
      };
      applications: {
        Row: FundingApplication;
        Insert: FundingApplicationInsert;
        Update: FundingApplicationUpdate;
        Relationships: [];
      };
      ai_qualification_logs: {
        Row: AiQualificationLog;
        Insert: AiQualificationLogInsert;
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      business_applications: {
        Row: BusinessApplication;
        Insert: BusinessApplicationInsert;
        Update: BusinessApplicationUpdate;
        Relationships: [];
      };
      lead_scores: {
        Row: LeadScore;
        Insert: LeadScoreInsert;
        Update: never;
        Relationships: [];
      };
      lender_matches: {
        Row: LenderMatch;
        Insert: LenderMatchInsert;
        Update: LenderMatchUpdate;
        Relationships: [];
      };
      outreach_logs: {
        Row: OutreachLog;
        Insert: OutreachLogInsert;
        Update: never;
        Relationships: [];
      };
      ai_tasks: {
        Row: AiTask;
        Insert: AiTaskInsert;
        Update: AiTaskUpdate;
        Relationships: [];
      };
      ai_task_logs: {
        Row: AiTaskLog;
        Insert: AiTaskLogInsert;
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRecord;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
        Relationships: [];
      };
      crm_activities: {
        Row: CrmActivity;
        Insert: CrmActivityInsert;
        Update: never;
        Relationships: [];
      };
      underwriting_reviews: {
        Row: UnderwritingReview;
        Insert: UnderwritingReviewInsert;
        Update: UnderwritingReviewUpdate;
        Relationships: [];
      };
      documents: {
        Row: DocumentRecord;
        Insert: DocumentInsert;
        Update: DocumentUpdate;
        Relationships: [];
      };
      funding_offers: {
        Row: FundingOffer;
        Insert: FundingOfferInsert;
        Update: FundingOfferUpdate;
        Relationships: [];
      };
      approval_statuses: {
        Row: ApprovalStatus;
        Insert: ApprovalStatusInsert;
        Update: ApprovalStatusUpdate;
        Relationships: [];
      };
      audit_logs: {
        Row: ProductionAuditLog;
        Insert: ProductionAuditLogInsert;
        Update: never;
        Relationships: [];
      };
      api_usage_logs: {
        Row: ApiUsageEvent;
        Insert: ApiUsageEventInsert;
        Update: never;
        Relationships: [];
      };
      
    };
    Views: {
      lead_cost_summary: {
        Row: {
          lead_id: string | null;
          total_cost: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      activate_prompt_version: {
        Args: {
          target_prompt_version_id: string;
          actor?: string | null;
        };
        Returns: PromptVersion;
      };
    };
    Enums: {
      lead_tier: LeadTier;
      lead_status: LeadStatus;
      delivery_status: DeliveryStatus;
      invoice_status: InvoiceStatus;
      actor_type: "system" | "founder" | "n8n_workflow";
      entity_type:
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
      alert_severity: AlertSeverity;
      api_service: ApiService;
      suppression_type: "email" | "domain" | "business_name" | "apollo_id" | "phone";
      added_by: "system" | "founder";
      lead_source_type: LeadSourceType;
      merchant_source_type: MerchantSourceType;
      merchant_source_health_status: MerchantSourceHealthStatus;
      acquisition_job_type: AcquisitionJobType;
      acquisition_job_status: AcquisitionJobStatus;
      enrichment_status: EnrichmentStatus;
      outreach_campaign_status: OutreachCampaignStatus;
      outreach_email_status: OutreachEmailStatus;
      reply_classification: ReplyClassification;
      simulation_run_status: SimulationRunStatus;
      simulation_mode: SimulationMode;
      simulation_lead_status: SimulationLeadStatus;
      acquisition_provider_status: AcquisitionProviderStatus;
      workflow_trace_status: WorkflowTraceStatus;
      diagnostic_health_status: DiagnosticHealthStatus;
      application_status: FundingApplication["status"];
      credit_score_range: CreditScoreRange;
      funding_product_type: FundingProductType;
      notification_channel: NotificationChannel;
      notification_status: NotificationStatus;
      crm_activity_type: CrmActivityType;
      underwriting_review_status: UnderwritingReviewStatus;
      app_role: AppRole;
      business_application_status: BusinessApplicationStatus;
      ai_task_status: AiTaskStatus;
      ai_task_type: AiTaskType;
      lender_match_status: LenderMatchStatus;
      document_status: DocumentStatus;
      funding_offer_status: FundingOfferStatus;
      approval_status_type: ApprovalStatusType;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type { Json };
