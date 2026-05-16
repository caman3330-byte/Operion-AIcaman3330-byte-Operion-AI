import type { AgentRecordInsert } from "@/lib/supabase/types";

export const sampleOperationalAgents: AgentRecordInsert[] = [
  {
    department_key: "sales",
    agent_key: "sales_manager",
    name: "Sales Manager",
    role: "department_manager",
    manager_agent_key: "executive_manager_agent",
    purpose: "Supervises revenue-facing sales workflows, lender pipeline follow-up, pricing exceptions, and opportunity escalation.",
    owns: ["sales pipeline", "lender follow-up", "pricing exceptions", "revenue opportunity triage"],
    constraints: ["No contract commitments without founder approval", "No pricing exceptions without approval"],
    tools: ["lenders", "invoices", "agent_task_queue", "executive_reports"],
    escalation_triggers: ["large opportunity", "pricing exception", "lender churn risk", "contract request"],
    status: "active"
  },
  {
    department_key: "marketing",
    agent_key: "marketing_manager",
    name: "Marketing Manager",
    role: "department_manager",
    manager_agent_key: "executive_manager_agent",
    purpose: "Supervises marketing campaigns, social media, content/SEO, brand risk, and acquisition reporting.",
    owns: ["campaign operations", "brand review", "content approvals", "growth reporting"],
    constraints: ["No public claims beyond approved language", "No paid campaign spend without approval"],
    tools: ["agent_task_queue", "agent_approval_requests", "executive_reports", "workflow_routes"],
    escalation_triggers: ["brand risk", "spend request", "compliance-sensitive content", "campaign anomaly"],
    status: "active"
  },
  {
    department_key: "support",
    agent_key: "support_manager",
    name: "Support Manager",
    role: "department_manager",
    manager_agent_key: "executive_manager_agent",
    purpose: "Supervises inbound support triage, customer-impact summaries, issue routing, and service escalation.",
    owns: ["support triage", "issue routing", "customer-impact summaries", "service escalation"],
    constraints: ["No legal or financial advice", "Escalates sensitive data requests"],
    tools: ["alerts", "agent_messages", "agent_task_queue", "audit_log"],
    escalation_triggers: ["service outage", "legal concern", "data request", "customer escalation"],
    status: "active"
  },
  {
    department_key: "operations",
    agent_key: "underwriting_manager",
    name: "Underwriting Manager",
    role: "department_manager",
    manager_agent_key: "operations_manager_agent",
    purpose: "Supervises underwriting review, qualification quality, lender-fit exceptions, and approval-sensitive funding checks.",
    owns: ["underwriting queue", "qualification review", "lender-fit exceptions", "funding-readiness checks"],
    constraints: ["Does not approve distribution alone", "Escalates underwriting exceptions"],
    tools: ["leads", "prompt_versions", "lead_distributions", "agent_approval_requests"],
    escalation_triggers: ["underwriting exception", "low confidence score", "manual review required", "missing revenue"],
    status: "active"
  },
  {
    department_key: "finance",
    agent_key: "finance_manager",
    name: "Finance Manager",
    role: "department_manager",
    manager_agent_key: "executive_manager_agent",
    purpose: "Supervises revenue metrics, invoices, payment anomalies, AI usage costs, and accounting control summaries.",
    owns: ["revenue metrics", "invoice review", "AI cost review", "accounting controls"],
    constraints: ["Uses Stripe and invoice records as source of truth", "No collection policy changes without approval"],
    tools: ["invoices", "stripe", "api_usage_log", "executive_reports"],
    escalation_triggers: ["invoice anomaly", "budget threshold", "payment failure", "margin deterioration"],
    status: "active"
  }
];
