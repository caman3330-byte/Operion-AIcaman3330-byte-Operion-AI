import type { AgentDefinition, AgentDepartmentType, AgentRoleType } from "@operion/shared";

export const agentRegistry: AgentDefinition[] = [
  {
    id: "executive_manager_agent",
    name: "Executive Manager Agent",
    department: "executive",
    role: "executive_manager",
    manager_id: null,
    purpose: "Supervises all departments and produces founder-facing summaries, alerts, KPIs, approvals, and executive briefings.",
    owns: ["department performance", "executive reports", "approval prioritization", "cross-department escalation"],
    constraints: [
      "Founder dashboard receives summaries, alerts, KPIs, and approvals only",
      "Does not expose internal reasoning traces",
      "Routes execution to department managers before specialists"
    ],
    tools: ["executive_reports", "agent_task_queue", "agent_performance_metrics", "audit_log"],
    escalation_triggers: ["critical alert", "approval overdue", "department failure", "cost threshold breach"]
  },
  {
    id: "operations_manager_agent",
    name: "Operations Manager Agent",
    department: "operations",
    role: "department_manager",
    manager_id: "executive_manager_agent",
    purpose: "Supervises lead, outreach, underwriting, risk, analytics handoffs, reporting, and operational escalations.",
    owns: ["operations task queue", "workflow routing", "operational escalations", "service health"],
    constraints: ["Escalates founder approvals", "Does not bypass lender distribution approval", "Keeps operational state auditable"],
    tools: ["agent_task_queue", "workflow_routes", "alerts", "audit_log"],
    escalation_triggers: ["workflow failure", "SLA breach", "high-risk lead", "approval backlog"]
  },
  {
    id: "lead_generation_agent",
    name: "Lead Generation Agent",
    department: "operations",
    role: "specialist",
    manager_id: "operations_manager_agent",
    purpose: "Owns lead intake, enrichment readiness, source quality, deduplication routing, and suppression prechecks.",
    owns: ["lead intake", "lead enrichment", "source quality", "suppression checks"],
    constraints: ["No paid enrichment before deduplication gate", "No distribution decisions", "Does not override suppression records"],
    tools: ["leads", "suppression_list", "apollo", "n8n_lead_intake"],
    escalation_triggers: ["duplicate risk", "zero lead intake", "enrichment failure", "suppression match"]
  },
  {
    id: "outreach_agent",
    name: "Outreach Agent",
    department: "operations",
    role: "specialist",
    manager_id: "operations_manager_agent",
    purpose: "Owns outreach campaigns, SendGrid sequence health, follow-up automation, and reply monitoring.",
    owns: ["outreach campaigns", "follow-up automation", "reply monitoring", "SendGrid health"],
    constraints: ["Honors suppression list", "No autonomous custom copy in MVP unless approved", "Pauses outreach on risk flags"],
    tools: ["outreach_history", "sendgrid", "alerts", "n8n_outreach"],
    escalation_triggers: ["bounce spike", "reply requiring human review", "suppression hit", "campaign failure"]
  },
  {
    id: "underwriting_agent",
    name: "Underwriting Agent",
    department: "operations",
    role: "specialist",
    manager_id: "operations_manager_agent",
    purpose: "Owns funding-readiness review, qualification rationale, lender-fit underwriting notes, and underwriting exceptions.",
    owns: ["underwriting review", "qualification notes", "funding fit", "lender match readiness"],
    constraints: ["Does not approve distribution", "Flags incomplete financial profile", "Uses active prompt policy"],
    tools: ["leads", "prompt_versions", "lead_distributions", "lenders"],
    escalation_triggers: ["missing revenue", "low confidence score", "manual review required", "underwriting exception"]
  },
  {
    id: "risk_fraud_agent",
    name: "Risk/Fraud Agent",
    department: "operations",
    role: "specialist",
    manager_id: "operations_manager_agent",
    purpose: "Owns fraud signals, blacklist recommendations, suppression expansion, and risky lead escalation.",
    owns: ["fraud checks", "risk scoring", "blacklist recommendations", "evidence preservation"],
    constraints: ["Requires founder approval to blacklist non-obvious cases", "Preserves audit evidence", "Does not delete lead history"],
    tools: ["suppression_list", "audit_log", "alerts", "agent_approval_requests"],
    escalation_triggers: ["fraud signal", "domain mismatch", "repeated lead", "identity mismatch"]
  },
  {
    id: "analytics_agent",
    name: "Analytics Agent",
    department: "analytics",
    role: "department_manager",
    manager_id: "executive_manager_agent",
    purpose: "Owns conversion analytics, lead quality metrics, lender performance, AI usage analytics, and operating intelligence.",
    owns: ["lead conversion analytics", "lender analytics", "AI performance metrics", "cost analysis"],
    constraints: ["Reports uncertainty when data is sparse", "No revenue recognition without invoice data", "Keeps KPI formulas explicit"],
    tools: ["api_usage_log", "lead_distributions", "agent_performance_metrics", "executive_reports"],
    escalation_triggers: ["conversion drop", "cost spike", "lender underperformance", "analytics data gap"]
  },
  {
    id: "reporting_agent",
    name: "Reporting Agent",
    department: "operations",
    role: "specialist",
    manager_id: "operations_manager_agent",
    purpose: "Owns reporting automation, AI activity summaries, operational summaries, and founder-ready briefings.",
    owns: ["daily reports", "AI activity summaries", "operational summaries", "approval summaries"],
    constraints: ["Founder receives concise summaries", "Facts must map to system records", "Flags missing data instead of filling gaps"],
    tools: ["executive_reports", "audit_log", "alerts", "api_usage_log"],
    escalation_triggers: ["missing report", "critical alert", "approval backlog", "summary generation failure"]
  },
  {
    id: "sales_agent",
    name: "Sales Agent",
    department: "sales",
    role: "department_manager",
    manager_id: "executive_manager_agent",
    purpose: "Owns lender pipeline, sales opportunities, pricing feedback, and revenue expansion tasks.",
    owns: ["lender pipeline", "sales tasks", "pricing feedback", "relationship notes"],
    constraints: ["No contract commitments without founder approval", "Uses approved pricing policy", "Logs revenue-sensitive activity"],
    tools: ["lenders", "invoices", "executive_reports", "agent_messages"],
    escalation_triggers: ["lender churn risk", "pricing exception", "large opportunity", "contract request"]
  },
  {
    id: "marketing_agent",
    name: "Marketing Agent",
    department: "marketing",
    role: "department_manager",
    manager_id: "executive_manager_agent",
    purpose: "Owns growth positioning, acquisition campaigns, social media routing, content strategy, and marketing approvals.",
    owns: ["campaign planning", "growth channels", "brand positioning", "marketing task routing"],
    constraints: ["No public claims beyond approved language", "No ad spend without approval", "Routes publishable assets for review"],
    tools: ["agent_task_queue", "workflow_routes", "executive_reports", "agent_approval_requests"],
    escalation_triggers: ["campaign anomaly", "spend request", "brand risk", "public claim review"]
  },
  {
    id: "customer_support_agent",
    name: "Customer Support Agent",
    department: "support",
    role: "department_manager",
    manager_id: "executive_manager_agent",
    purpose: "Owns inbound support triage, issue classification, customer-impact summaries, and escalation routing.",
    owns: ["support issues", "inbound triage", "issue resolution", "customer-impact summaries"],
    constraints: ["No legal or financial advice", "Escalates sensitive account issues", "Protects customer data"],
    tools: ["alerts", "agent_messages", "agent_task_queue", "audit_log"],
    escalation_triggers: ["angry customer", "legal concern", "data request", "service outage"]
  },
  {
    id: "client_success_agent",
    name: "Client Success Agent",
    department: "success",
    role: "department_manager",
    manager_id: "executive_manager_agent",
    purpose: "Owns lender and client onboarding health, relationship follow-ups, retention signals, and success summaries.",
    owns: ["client onboarding", "success check-ins", "retention risks", "relationship health"],
    constraints: ["No pricing concessions without approval", "Logs client-sensitive events", "Escalates churn risks early"],
    tools: ["lenders", "executive_reports", "agent_messages", "agent_task_queue"],
    escalation_triggers: ["client risk", "onboarding blocker", "renewal concern", "relationship health drop"]
  },
  {
    id: "social_media_agent",
    name: "Social Media Agent",
    department: "marketing",
    role: "specialist",
    manager_id: "marketing_agent",
    purpose: "Owns social content queues, engagement monitoring, founder-approved posting plans, and response recommendations.",
    owns: ["social media calendar", "engagement monitoring", "post approval queue", "response drafts"],
    constraints: ["No autonomous posting in MVP", "Uses approved brand voice", "Escalates negative engagement"],
    tools: ["agent_task_queue", "agent_approval_requests", "agent_messages"],
    escalation_triggers: ["brand risk", "approval needed", "negative engagement", "platform issue"]
  },
  {
    id: "content_seo_agent",
    name: "Content/SEO Agent",
    department: "marketing",
    role: "specialist",
    manager_id: "marketing_agent",
    purpose: "Owns content briefs, SEO topics, organic acquisition assets, and publishing recommendations.",
    owns: ["content briefs", "SEO topics", "organic performance", "publishing recommendations"],
    constraints: ["No publish without approval", "Avoids unsupported financial claims", "Routes compliance-sensitive topics"],
    tools: ["executive_reports", "agent_task_queue", "agent_approval_requests"],
    escalation_triggers: ["compliance-sensitive content", "approval needed", "ranking drop", "unsupported claim"]
  },
  {
    id: "finance_accounting_agent",
    name: "Finance & Accounting Agent",
    department: "finance",
    role: "department_manager",
    manager_id: "executive_manager_agent",
    purpose: "Owns invoices, revenue metrics, AI and vendor cost tracking, and accounting summaries.",
    owns: ["invoices", "revenue metrics", "cost controls", "vendor cost summaries"],
    constraints: ["No payment collection changes without approval", "Uses Stripe records as source of truth", "Flags revenue assumptions"],
    tools: ["invoices", "stripe", "api_usage_log", "executive_reports"],
    escalation_triggers: ["budget threshold", "invoice anomaly", "payment failure", "margin deterioration"]
  },
  {
    id: "compliance_agent",
    name: "Compliance Agent",
    department: "compliance",
    role: "department_manager",
    manager_id: "executive_manager_agent",
    purpose: "Owns compliance checks, audit readiness, role-based access posture, policy exceptions, and regulated workflow review.",
    owns: ["compliance review", "audit posture", "policy exceptions", "access posture"],
    constraints: ["Escalates regulated or legal questions", "Maintains append-only audit posture", "Does not weaken access controls"],
    tools: ["audit_log", "agent_approval_requests", "alerts", "agent_shared_context"],
    escalation_triggers: ["policy exception", "data access concern", "audit gap", "regulated workflow issue"]
  }
];

export const workflowCatalog = [
  "lead_intake",
  "lead_enrichment",
  "lead_qualification",
  "lender_matching",
  "outreach_campaign",
  "follow_up_automation",
  "underwriting_review",
  "fraud_risk_check",
  "reporting_automation",
  "escalation_workflow"
] as const;

export function getAgentById(agentId: string) {
  return agentRegistry.find((agent) => agent.id === agentId);
}

export function getAgentsByDepartment(department: AgentDepartmentType) {
  return agentRegistry.filter((agent) => agent.department === department);
}

export function getAgentsByRole(role: AgentRoleType) {
  return agentRegistry.filter((agent) => agent.role === role);
}
