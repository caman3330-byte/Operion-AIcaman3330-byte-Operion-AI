import type { AiTaskLog } from "@operion/shared";

export function categorizeAiExecutionFailure(
  execution: Pick<AiTaskLog, "status" | "message" | "provider" | "latency_ms" | "metadata">
) {
  if (!isActionableAiExecutionFailure(execution)) return "none";

  const text = `${execution.message} ${JSON.stringify(execution.metadata ?? {})}`.toLowerCase();
  if (text.includes("json") || text.includes("schema") || text.includes("parse") || text.includes("malformed")) return "malformed_response";
  if (text.includes("timeout") || text.includes("latency") || (execution.latency_ms ?? 0) > 30_000) return "latency";
  if (text.includes("rate") || text.includes("quota") || text.includes("429")) return "provider_rate_limit";
  if (text.includes("auth") || text.includes("key") || text.includes("401") || text.includes("403")) return "provider_auth";
  if (!execution.provider) return "provider_unavailable";
  return "provider_error";
}

export function isActionableAiExecutionFailure(
  execution: Pick<AiTaskLog, "status" | "message" | "metadata">
) {
  if (execution.status !== "failed" && execution.status !== "blocked") return false;

  const text = `${execution.message} ${JSON.stringify(execution.metadata ?? {})}`.toLowerCase();
  if (text.includes("archived stale") || text.includes("archive_reason")) return false;
  if (text.includes("future document ai processing hook registered")) return false;
  if (text.includes("pending external worker activation")) return false;
  return true;
}
