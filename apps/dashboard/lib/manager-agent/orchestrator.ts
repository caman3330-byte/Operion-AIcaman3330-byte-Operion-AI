import type { Json } from "@operion/shared";
import { selectAnthropicModel } from "@/lib/ai/anthropic-models";
import { createManagerBrainPlan } from "@/lib/ai/manager-brain";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { managerAgentRepository } from "@/lib/repositories/manager-agent";
import { orchestrationRepository } from "@/lib/repositories/orchestration";

interface CreateManagerRunInput {
  objective: string;
  context?: Json | null;
  requestedBy: string;
}

export async function createManagerAgentRun(input: CreateManagerRunInput) {
  const run = await managerAgentRepository.createRun({
    objective: input.objective,
    context: input.context ?? null,
    status: "running",
    manager_model: selectAnthropicModel(process.env, "premium"),
    requested_by: input.requestedBy
  });

  await writeAuditLog({
    eventType: "manager_agent_run_started",
    actorType: "founder",
    actorId: input.requestedBy,
    entityType: "manager_agent",
    entityId: run.id,
    metadata: {
      objective: input.objective
    } as Json
  });

  try {
    const startedAt = Date.now();
    const [plan, agents] = await Promise.all([
      createManagerBrainPlan({
        objective: input.objective,
        context: input.context ?? null,
        requestedBy: input.requestedBy
      }),
      orchestrationRepository.listAgents()
    ]);
    const agentByKey = new Map(agents.map((agent) => [agent.agent_key, agent]));

    const legacyTasks = plan.assignments.map((assignment) => {
      const agent = agentByKey.get(assignment.assigned_agent_key);
      return {
        run_id: run.id,
        agent_id: assignment.assigned_agent_key,
        agent_name: agent?.name ?? assignment.assigned_agent_key,
        title: assignment.title,
        instructions: assignment.instructions,
        priority: assignment.priority,
        status: "assigned" as const
      };
    });

    const createdLegacyTasks = await managerAgentRepository.createTasks(legacyTasks);
    const queuedTasks = await Promise.all(
      plan.assignments.map(async (assignment) => {
        let task = await orchestrationRepository.createTask({
          run_id: run.id,
          workflow_key: assignment.workflow_key ?? null,
          assigned_agent_key: assignment.assigned_agent_key,
          department_key: assignment.department_key,
          title: assignment.title,
          instructions: assignment.instructions,
          priority: assignment.priority,
          status: assignment.requires_approval ? "blocked" : "queued",
          requires_approval: assignment.requires_approval ?? false,
          context: {
            manager_run_id: run.id,
            manager_summary: plan.summary,
            risk_notes: plan.risk_notes,
            objective: input.objective,
            source: "manager_brain"
          } as Json,
          created_by: input.requestedBy
        });

        if (assignment.requires_approval) {
          const approval = await orchestrationRepository.createApproval({
            task_id: task.id,
            approval_type: "manager_brain_approval",
            requested_by_agent_key: assignment.assigned_agent_key,
            assigned_to: "founder",
            title: `Manager approval: ${assignment.title}`,
            details: {
              manager_run_id: run.id,
              assignment,
              risk_notes: plan.risk_notes
            } as unknown as Json,
            status: "pending"
          });
          task = await orchestrationRepository.updateTask(task.id, { approval_id: approval.id, status: "blocked" });
        }

        return task;
      })
    );

    const completedRun = await managerAgentRepository.updateRun(run.id, {
      status: "completed",
      final_summary: plan.summary,
      completed_at: new Date().toISOString()
    });

    await writeAuditLog({
      eventType: "manager_agent_run_delegated",
      actorType: "system",
      actorId: "manager_brain",
      entityType: "manager_agent",
      entityId: run.id,
      afterState: {
        run_id: run.id,
        manager_task_count: createdLegacyTasks.length,
        queued_task_count: queuedTasks.length,
        final_summary: plan.summary
      } as Json,
      metadata: {
        action: "manager_agent_run_delegated",
        risk_notes: plan.risk_notes,
        latency_ms: Date.now() - startedAt
      } as Json
    });

    return {
      run: completedRun,
      tasks: createdLegacyTasks,
      queuedTasks,
      plan
    };
  } catch (error) {
    logger.error("manager_agent_run_failed", { runId: run.id, error });
    await managerAgentRepository.updateRun(run.id, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Unknown manager-agent error",
      completed_at: new Date().toISOString()
    });
    throw error;
  }
}
