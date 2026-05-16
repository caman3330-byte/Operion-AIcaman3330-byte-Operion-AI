import type { AgentDefinition, Json, ManagerAgentPriority } from "@operion/shared";
import { z } from "zod";
import { estimateAnthropicCost, recordApiUsage } from "@/lib/api-usage";
import { ConfigurationError, ValidationError } from "@/lib/errors";
import { readServerEnv } from "@/lib/env";
import { orchestrationRepository } from "@/lib/repositories/orchestration";
import { withRetry } from "@/lib/retry";

export interface ManagerBrainInput {
  objective: string;
  context?: Json | null;
  requestedBy: string;
}

export interface ManagerBrainAssignment {
  assigned_agent_key: string;
  department_key: string;
  title: string;
  instructions: string;
  priority: ManagerAgentPriority;
  workflow_key?: string | null | undefined;
  requires_approval?: boolean | undefined;
}

export interface ManagerBrainPlan {
  summary: string;
  risk_notes: string[];
  assignments: ManagerBrainAssignment[];
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

const managerBrainPlanSchema = z.object({
  summary: z.string().min(1),
  risk_notes: z.array(z.string()).default([]),
  assignments: z
    .array(
      z.object({
        assigned_agent_key: z.string().min(1),
        department_key: z.string().min(1),
        title: z.string().min(1),
        instructions: z.string().min(1),
        priority: z.enum(["low", "medium", "high", "urgent"]),
        workflow_key: z.string().min(1).nullable().optional(),
        requires_approval: z.boolean().optional()
      })
    )
    .min(1)
    .max(12)
});

export async function createManagerBrainPlan(input: ManagerBrainInput): Promise<ManagerBrainPlan> {
  const env = readServerEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new ConfigurationError("ANTHROPIC_API_KEY is required for manager brain planning");
  }

  const [agents, routes] = await Promise.all([
    orchestrationRepository.listAgents(),
    orchestrationRepository.listWorkflowRoutes(true)
  ]);
  const availableAgents = agents.map((agent): AgentDefinition => ({
    id: agent.agent_key,
    name: agent.name,
    department: agent.department_key as AgentDefinition["department"],
    role: agent.role,
    manager_id: agent.manager_agent_key,
    purpose: agent.purpose,
    owns: jsonStringArray(agent.owns),
    constraints: jsonStringArray(agent.constraints),
    tools: jsonStringArray(agent.tools),
    escalation_triggers: jsonStringArray(agent.escalation_triggers)
  }));
  const startedAt = Date.now();

  const system = [
    "You are the Operion AI Executive Manager Brain.",
    "Plan bounded work for internal department agents.",
    "Return strict JSON only.",
    "Do not wrap JSON in markdown fences.",
    "Keep summaries concise: summary under 500 characters, risk_notes max 5, assignments max 8, instructions under 280 characters each.",
    "Use only available agent keys and workflow keys.",
    "Do not claim work is complete. Create executable subtasks.",
    "Approval-sensitive actions must be marked requires_approval."
  ].join(" ");

  const user = JSON.stringify({
    objective: input.objective,
    context: input.context ?? null,
    requested_by: input.requestedBy,
    available_agents: availableAgents,
    workflow_routes: routes.map((route) => ({
      workflow_key: route.workflow_key,
      name: route.name,
      department_key: route.department_key,
      primary_agent_key: route.primary_agent_key,
      requires_approval: route.requires_approval
    })),
    output_schema: {
      summary: "Founder-facing summary of the operating plan.",
      risk_notes: ["Risks, approval needs, or missing integration blockers."],
      assignments: [
        {
          assigned_agent_key: "one available agent key",
          department_key: "agent department key",
          title: "short task title",
          instructions: "bounded execution instructions",
          priority: "low | medium | high | urgent",
          workflow_key: "optional matching workflow key or null",
          requires_approval: "boolean"
        }
      ]
    }
  });

  try {
    const response = await withRetry(
      async () => {
        const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY as string,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: env.ANTHROPIC_MODEL,
            max_tokens: 3200,
            temperature: 0,
            system,
            messages: [{ role: "user", content: user }]
          })
        });

        if (!anthropicResponse.ok) {
          const providerError = await readProviderError(anthropicResponse);
          if (anthropicResponse.status === 401 || anthropicResponse.status === 403) {
            throw new ConfigurationError("ANTHROPIC_API_KEY was rejected by Anthropic", {
              status: anthropicResponse.status,
              providerError
            });
          }

          if (anthropicResponse.status === 400 || anthropicResponse.status === 404) {
            throw new ConfigurationError("Anthropic manager brain request was rejected. Check ANTHROPIC_MODEL and request settings.", {
              status: anthropicResponse.status,
              providerError
            });
          }

          throw new Error(`Anthropic manager brain request failed with ${anthropicResponse.status}`);
        }

        return (await anthropicResponse.json()) as AnthropicResponse;
      },
      {
        operation: "managerBrain.createPlan",
        shouldRetry: (error) => !(error instanceof ConfigurationError || error instanceof ValidationError)
      }
    );

    const text = response.content?.find((content) => content.type === "text")?.text;
    if (!text) {
      throw new ValidationError("Manager brain response did not include text content");
    }
    if (response.stop_reason === "max_tokens") {
      throw new ValidationError("Manager brain response exceeded the configured token limit", {
        preview: text.slice(0, 500)
      });
    }

    const parsed = managerBrainPlanSchema.parse(parseManagerBrainJson(text));
    const agentKeys = new Set(availableAgents.map((agent) => agent.id));
    for (const assignment of parsed.assignments) {
      if (!agentKeys.has(assignment.assigned_agent_key)) {
        throw new ValidationError(`Manager brain selected unknown agent: ${assignment.assigned_agent_key}`, assignment);
      }
    }

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    await recordApiUsage({
      service: "anthropic",
      operation: "manager_brain_plan",
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateAnthropicCost(inputTokens, outputTokens),
      success: true,
      latencyMs: Date.now() - startedAt
    });

    return parsed;
  } catch (error) {
    await recordApiUsage({
      service: "anthropic",
      operation: "manager_brain_plan",
      success: false,
      latencyMs: Date.now() - startedAt
    });
    throw error;
  }
}

function jsonStringArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseManagerBrainJson(text: string) {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // Fall through to the validation error below.
      }
    }
  }

  throw new ValidationError("Manager brain response was not valid JSON", {
    preview: trimmed.slice(0, 500)
  });
}

async function readProviderError(response: Response) {
  const body = await response.text();
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body) as Json;
  } catch {
    return body.slice(0, 500);
  }
}
