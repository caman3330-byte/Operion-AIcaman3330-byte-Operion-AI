import type { AgentRecordInsert } from "@/lib/supabase/types";

export const phase2OperationalAgents: AgentRecordInsert[] = [
  {
    department_key: "sales",
    agent_key: "sales_agent",
    name: "Sales Agent",
    role: "department_manager",
    manager_agent_key: "executive_manager_agent",
    purpose: "Owns lender pipeline, routing opportunities, sales follow-up, and funded revenue signals.",
    owns: ["lender pipeline", "sales tasks", "revenue opportunities"],
    constraints: ["No contract commitments without founder approval", "No pricing exceptions without approval"],
    tools: ["lenders", "lender_matches", "funding_offers"],
    escalation_triggers: ["pricing exception", "large opportunity", "lender churn risk"],
    status: "active"
  },
  {
    department_key: "operations",
    agent_key: "underwriting_agent",
    name: "Underwriting Agent",
    role: "specialist",
    manager_agent_key: "operations_manager_agent",
    purpose: "Owns funding fit analysis, underwriting summaries, document needs, and review escalation.",
    owns: ["underwriting review", "funding fit", "document requirements"],
    constraints: ["Does not issue final approval", "Escalates incomplete or high-risk profiles"],
    tools: ["claude", "openai", "lead_scores", "underwriting_reviews"],
    escalation_triggers: ["low confidence", "fraud risk", "manual review required"],
    status: "active"
  },
  {
    department_key: "operations",
    agent_key: "outreach_agent",
    name: "Outreach Agent",
    role: "specialist",
    manager_agent_key: "operations_manager_agent",
    purpose: "Owns outreach draft generation, queue readiness, reply classification, and approval-gated sends.",
    owns: ["outreach queue", "email drafts", "reply classification"],
    constraints: ["No fully automated send without approval", "Honors suppression and opt-out records"],
    tools: ["openai", "sendgrid", "outreach_logs"],
    escalation_triggers: ["opt out", "angry reply", "positive buying intent"],
    status: "active"
  },
  {
    department_key: "support",
    agent_key: "support_agent",
    name: "Support Agent",
    role: "specialist",
    manager_agent_key: "customer_support_agent",
    purpose: "Owns customer support classification, response drafting, and account escalation.",
    owns: ["support triage", "response drafts", "customer issue routing"],
    constraints: ["No legal or financial advice", "Escalates sensitive account issues"],
    tools: ["openai", "alerts", "agent_messages"],
    escalation_triggers: ["legal concern", "data request", "funding complaint"],
    status: "active"
  },
  {
    department_key: "analytics",
    agent_key: "analytics_agent",
    name: "Analytics Agent",
    role: "department_manager",
    manager_agent_key: "executive_manager_agent",
    purpose: "Owns funnel analytics, lender performance, cost reporting, and operating intelligence.",
    owns: ["conversion analytics", "lender analytics", "AI cost analytics"],
    constraints: ["Reports uncertainty when data is sparse", "Uses persisted system data only"],
    tools: ["api_usage_logs", "lead_scores", "lender_matches"],
    escalation_triggers: ["cost spike", "conversion drop", "lender underperformance"],
    status: "active"
  },
  {
    department_key: "executive",
    agent_key: "executive_manager_agent",
    name: "Executive Manager Agent",
    role: "executive_manager",
    manager_agent_key: null,
    purpose: "Supervises all AI departments and produces founder-facing summaries, KPIs, alerts, and approvals.",
    owns: ["department performance", "executive reports", "approval prioritization"],
    constraints: ["Founder receives summaries, alerts, KPIs, and approvals only"],
    tools: ["claude", "executive_reports", "agent_performance_metrics"],
    escalation_triggers: ["critical alert", "approval overdue", "department failure"],
    status: "active"
  }
];
