import type { Json } from "@operion/shared";

export type CompanyStatus = "OPERATIONAL" | "PAUSED" | "DEGRADED" | "EMERGENCY_STOP";
export type AgentWorkStatus =
  | "OFFLINE"
  | "IDLE"
  | "WORKING"
  | "WAITING"
  | "BLOCKED"
  | "ERROR"
  | "PAUSED"
  | "REQUIRES_APPROVAL";
export type ToolPermission = "READ" | "PROPOSE" | "EXECUTE" | "APPROVAL_REQUIRED" | "DENIED";
export type ToolRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ToolRunStatus = "started" | "completed" | "failed" | "blocked";
export type EventSeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL";
export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVING" | "RESOLVED" | "ESCALATED";

export interface CompanyOperatingState {
  company_key: string;
  status: CompanyStatus;
  autonomy_level: string;
  reason: string | null;
  updated_by: string | null;
  updated_at: string;
  emergency_stop: boolean;
  max_concurrent_tasks: number;
  company_daily_ai_budget: number;
  company_daily_task_limit: number;
}

export interface AgentRuntimeState {
  agent_key: string;
  status: AgentWorkStatus;
  current_task_id: string | null;
  last_task_id: string | null;
  heartbeat_at: string | null;
  last_started_at: string | null;
  last_completed_at: string | null;
  tasks_completed: number;
  tasks_failed: number;
  success_rate: number;
  average_latency_ms: number;
  tokens_used: number;
  estimated_cost: number;
  last_error: string | null;
  current_provider: string | null;
  current_model: string | null;
  updated_at: string;
}

export interface ToolRegistryItem {
  tool_key: string;
  name: string;
  description: string;
  input_schema: Json;
  output_schema: Json;
  risk_level: ToolRiskLevel;
  permission: ToolPermission;
  enabled: boolean;
  handler_ref: string;
  created_at: string;
  updated_at: string;
}

export interface AgentEventInput {
  eventType: string;
  actorAgentId?: string | null;
  department?: string | null;
  taskId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Json;
  severity?: EventSeverity;
}

export interface IncidentInput {
  incidentType: string;
  severity?: EventSeverity;
  title: string;
  description?: string | null;
  actorAgentId?: string | null;
  department?: string | null;
  taskId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Json;
}

export interface ToolRunInput {
  toolKey: string;
  taskId?: string | null;
  agentKey?: string | null;
  input?: Json;
}

export interface ToolRunCompletion {
  output?: Json;
  errorMessage?: string | null;
  latencyMs?: number;
  estimatedCost?: number;
}

export interface AgentEvaluationRecord {
  id: string;
  evaluation_key: string;
  window_start: string;
  window_end: string;
  source_id: string | null;
  agent_key: string | null;
  task_id: string | null;
  evaluation_type: "source_performance" | "agent_performance" | "ai_performance" | "failure";
  metrics: Json;
  outcome: "positive" | "neutral" | "negative" | "insufficient_evidence";
  evidence: Json;
  evaluator: string;
  created_at: string;
}

export interface AgentLessonRecord {
  id: string;
  lesson_key: string;
  evaluation_id: string | null;
  source_id: string | null;
  agent_key: string | null;
  task_id: string | null;
  lesson_type: "source_priority" | "source_cooldown" | "task_priority" | "agent_selection" | "extraction_strategy" | "ai_model_routing";
  conclusion: string;
  confidence: number;
  evidence: Json;
  created_by: string;
  created_at: string;
}

export interface AgentStrategyUpdateRecord {
  id: string;
  strategy_key: string;
  lesson_id: string | null;
  source_id: string | null;
  agent_key: string | null;
  task_id: string | null;
  strategy_type: "source_priority" | "source_cooldown" | "task_priority" | "agent_selection" | "extraction_strategy" | "ai_model_routing";
  previous_value: Json | null;
  new_value: Json;
  reason: string;
  evidence: Json;
  applied: boolean;
  applied_at: string | null;
  created_by: string;
  created_at: string;
}
