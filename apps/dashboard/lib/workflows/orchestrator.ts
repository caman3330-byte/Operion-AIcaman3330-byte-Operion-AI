import { logger } from '../logger';
import { getSupabaseAdmin } from '../supabase/server';
import type { AgentQueueStatus, Json, ManagerAgentPriority } from '@operion/shared';

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'dead_letter';

export interface WorkflowJob {
  id: string;
  workflowKey: string;
  jobType: string;
  status: JobStatus;
  priority: number;
  payload: Record<string, any>;
  result?: Record<string, any>;
  errorMessage?: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowState {
  workflowId: string;
  workflowKey: string;
  status: WorkflowStatus;
  currentStep: string;
  stepData: Record<string, any>;
  failedStep?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

function toQueuePriority(priority?: number): ManagerAgentPriority {
  if (priority === undefined) return 'medium';
  if (priority >= 90) return 'urgent';
  if (priority >= 60) return 'high';
  if (priority <= 20) return 'low';
  return 'medium';
}

function fromQueuePriority(priority?: ManagerAgentPriority): number {
  switch (priority) {
    case 'urgent':
      return 100;
    case 'high':
      return 75;
    case 'low':
      return 10;
    case 'medium':
    default:
      return 50;
  }
}

function workflowContext(input: {
  workflowKey: string;
  jobType: string;
  payload: Record<string, any>;
  maxAttempts?: number;
  assignedAgentKey?: string;
  departmentKey?: string;
  workflowRoute?: Record<string, any>;
}): Json {
  return {
    workflowPayload: input.payload as Json,
    workflowJobType: input.jobType,
    maxAttempts: input.maxAttempts || 3,
    ...(input.assignedAgentKey ? { assignedAgentKey: input.assignedAgentKey } : {}),
    ...(input.departmentKey ? { departmentKey: input.departmentKey } : {}),
    ...(input.workflowRoute ? { workflowRoute: input.workflowRoute } : {})
  };
}

function mapQueueRowToWorkflowJob(row: any): WorkflowJob {
  const context = (row.context || {}) as Record<string, any>;
  const job: WorkflowJob = {
    id: row.id,
    workflowKey: row.workflow_key || context.workflowKey || 'unknown',
    jobType: context.workflowJobType || row.assigned_agent_key || 'unknown',
    status: row.status as JobStatus,
    priority: fromQueuePriority(row.priority as ManagerAgentPriority),
    payload: context.workflowPayload || {},
    attempts: context.attempts || 0,
    maxAttempts: context.maxAttempts || 3,
    createdAt: row.created_at,
  };

  if (row.result_summary) {
    job.result = { summary: row.result_summary };
  }
  if (row.error_message) {
    job.errorMessage = row.error_message;
  }
  if (row.due_at) {
    job.nextRetryAt = row.due_at;
  }
  if (row.started_at) {
    job.startedAt = row.started_at;
  }
  if (row.completed_at) {
    job.completedAt = row.completed_at;
  }

  return job;
}

/**
 * Create a new workflow job
 */
export async function createWorkflowJob(input: {
  workflowKey: string;
  jobType: string;
  payload: Record<string, any>;
  priority?: number;
  maxAttempts?: number;
}): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();
    const route = await resolveWorkflowRoute(supabase, input.workflowKey);
    const assignedAgentKey = route?.primary_agent_key ?? "operations_manager_agent";
    const departmentKey = route?.department_key ?? "operations";

    const { data, error } = await supabase
      .from('agent_task_queue')
      .insert({
        status: 'queued',
        priority: toQueuePriority(input.priority),
        workflow_key: input.workflowKey,
        assigned_agent_key: assignedAgentKey,
        department_key: departmentKey,
        title: input.jobType,
        instructions: `Execute workflow job ${input.jobType}`,
        context: workflowContext({
          ...input,
          assignedAgentKey,
          departmentKey,
          ...(route ? { workflowRoute: route as Record<string, any> } : {})
        }),
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create workflow job', { error: error.message });
      return { success: false, error: error.message };
    }

    logger.info('Workflow job created', {
      jobId: (data as any)?.id,
      workflowKey: input.workflowKey,
      jobType: input.jobType,
    });

    return { success: true, jobId: (data as any)?.id };
  } catch (error) {
    logger.error('Exception creating workflow job', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Get job by ID
 */
export async function getWorkflowJob(jobId: string): Promise<{ job?: WorkflowJob; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();

    const { data, error } = await supabase
      .from('agent_task_queue')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      logger.error('Failed to fetch workflow job', { error: error.message });
      return { error: error.message };
    }

    return { job: mapQueueRowToWorkflowJob(data) };
  } catch (error) {
    logger.error('Exception fetching workflow job', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Internal error' };
  }
}

async function resolveWorkflowRoute(supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>, workflowKey: string) {
  const { data } = await supabase
    .from('workflow_routes')
    .select('workflow_key, department_key, primary_agent_key, fallback_agent_key, active')
    .eq('workflow_key', workflowKey)
    .maybeSingle();

  if (!data || data.active === false) {
    return null;
  }

  return data;
}

/**
 * Update job status
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  updates?: {
    result?: Record<string, any>;
    errorMessage?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();

    const queueStatus: AgentQueueStatus = status === 'dead_letter' ? 'failed' : status;
    const updatePayload: any = { status: queueStatus };

    if (status === 'running' && !updates?.errorMessage) {
      updatePayload.started_at = new Date().toISOString();
    }

    if (status === 'completed') {
      updatePayload.completed_at = new Date().toISOString();
      if (updates?.result) {
        updatePayload.result_summary = JSON.stringify(updates.result);
      }
    }

    if (status === 'failed') {
      updatePayload.error_message = updates?.errorMessage;
      if (!updates?.errorMessage) {
        updatePayload.completed_at = new Date().toISOString();
      }
    }

    const { error } = await supabase
      .from('agent_task_queue')
      .update(updatePayload)
      .eq('id', jobId);

    if (error) {
      logger.error('Failed to update job status', { error: error.message });
      return { success: false, error: error.message };
    }

    logger.info('Job status updated', { jobId, status });
    return { success: true };
  } catch (error) {
    logger.error('Exception updating job status', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Fetch pending jobs for worker
 */
export async function fetchPendingJobs(limit: number = 10): Promise<{ jobs: WorkflowJob[]; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();

    const { data, error } = await supabase
      .from('agent_task_queue')
      .select('*')
      .eq('status', 'queued')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error('Failed to fetch pending jobs', { error: error.message });
      return { jobs: [], error: error.message };
    }

    const jobs: WorkflowJob[] = (data || []).map(mapQueueRowToWorkflowJob);

    return { jobs };
  } catch (error) {
    logger.error('Exception fetching pending jobs', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { jobs: [], error: 'Internal error' };
  }
}

/**
 * Move job to dead letter queue after max attempts
 */
export async function moveToDeadLetter(jobId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();

    const { error } = await supabase
      .from('agent_task_queue')
      .update({
        status: 'failed',
        error_message: reason,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) {
      logger.error('Failed to move job to dead letter', { error: error.message });
      return { success: false, error: error.message };
    }

    logger.warn('Job moved to dead letter queue', { jobId, reason });
    return { success: true };
  } catch (error) {
    logger.error('Exception moving job to dead letter', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Retry job with exponential backoff
 */
export async function retryJob(jobId: string): Promise<{ success: boolean; nextRetryAt?: string; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();

    // Get current job
    const { data: jobData, error: fetchError } = await supabase
      .from('agent_task_queue')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !jobData) {
      return { success: false, error: 'Job not found' };
    }

    const context = (((jobData as any).context || {}) as Record<string, any>);
    const attempts = context.attempts || 0;
    const maxAttempts = context.maxAttempts || 3;

    if (attempts >= maxAttempts) {
      return await moveToDeadLetter(jobId, `Max attempts (${maxAttempts}) exceeded`);
    }

    // Calculate exponential backoff: 2^attempts * 30 seconds
    const delayMs = Math.pow(2, attempts) * 30 * 1000;
    const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

    const { error } = await supabase
      .from('agent_task_queue')
      .update({
        status: 'queued',
        due_at: nextRetryAt,
        error_message: null,
        context: {
          ...context,
          attempts: attempts + 1,
        } as Json,
      })
      .eq('id', jobId);

    if (error) {
      logger.error('Failed to retry job', { error: error.message });
      return { success: false, error: error.message };
    }

    logger.info('Job queued for retry', { jobId, attempts: attempts + 1, nextRetryAt });
    return { success: true, nextRetryAt };
  } catch (error) {
    logger.error('Exception retrying job', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Define a foundational workflow agent type
 */
export interface WorkflowAgent {
  key: string;
  name: string;
  description: string;
  execute: (job: WorkflowJob) => Promise<{ success: boolean; result?: any; error?: string }>;
}

export const foundationalAgents = {
  intake: {
    key: 'intake_agent',
    name: 'Intake Agent',
    description: 'Processes new merchant applications',
  },
  underwriting: {
    key: 'underwriting_agent',
    name: 'Underwriting Agent',
    description: 'Performs AI underwriting on applications',
  },
  routing: {
    key: 'routing_agent',
    name: 'Routing Agent',
    description: 'Routes applications to compatible lenders',
  },
  followup: {
    key: 'followup_agent',
    name: 'Follow-Up Agent',
    description: 'Manages customer follow-up and communications',
  },
  analytics: {
    key: 'analytics_agent',
    name: 'Analytics Agent',
    description: 'Generates operational insights and reports',
  },
};
