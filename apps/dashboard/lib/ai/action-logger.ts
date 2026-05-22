import { getSupabaseAdmin } from '../supabase/server';
import { logger } from '../logger';
import { AIActionLog } from './types';

interface LogAIActionInput {
  modelUsed: string;
  executionLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  failureReason?: string;
  retryCount: number;
  confidenceScore: number;
  promptType:
    | 'underwriting'
    | 'risk_analysis'
    | 'lead_qualification'
    | 'lender_matching'
    | 'operational_insights'
    | 'banking_patterns';
  workflowSource: string;
  merchantId?: string;
  dealId?: string;
  metadata?: Record<string, any>;
}

export async function logAIAction(input: LogAIActionInput): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();

    // Track operational metrics
    const record: AIActionLog = {
      modelUsed: input.modelUsed,
      executionLatencyMs: input.executionLatencyMs,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      estimatedCostUsd: input.estimatedCostUsd,
      retryCount: input.retryCount,
      confidenceScore: input.confidenceScore,
      promptType: input.promptType,
      workflowSource: input.workflowSource,
      metadata: input.metadata || {},
      ...(input.failureReason ? { failureReason: input.failureReason } : {}),
      ...(input.merchantId ? { merchantId: input.merchantId } : {}),
      ...(input.dealId ? { dealId: input.dealId } : {}),
    };

    // Insert into ai_actions table (or similar operational log table)
    const { data, error } = await supabase
      .from('ai_task_logs')
      .insert({
        ai_task_id: 'operational-' + Date.now(), // Placeholder
        status: input.failureReason ? 'failed' : 'completed',
        message: input.failureReason || 'AI action completed successfully',
        provider: input.modelUsed,
        model: input.modelUsed,
        input_tokens: input.inputTokens,
        output_tokens: input.outputTokens,
        latency_ms: input.executionLatencyMs,
        cost_estimate_usd: input.estimatedCostUsd,
        metadata: {
          ...record,
          workflowSource: input.workflowSource,
          merchantId: input.merchantId,
          dealId: input.dealId,
        },
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to log AI action', {
        error: error.message,
        input,
      });
      return { success: false, error: error.message };
    }

    logger.info('AI action logged', {
      model: input.modelUsed,
      latency: input.executionLatencyMs,
      cost: input.estimatedCostUsd,
      confidenceScore: input.confidenceScore,
    });

    return { success: true, id: (data as any)?.id };
  } catch (error) {
    logger.error('Exception logging AI action', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface AIOperationalMetrics {
  totalActions: number;
  averageLatencyMs: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  failureRate: number;
  averageConfidenceScore: number;
  actionsByModel: Record<string, number>;
  actionsByPromptType: Record<string, number>;
  actionsByWorkflow: Record<string, number>;
  highConfidenceActions: number;
  failedActions: number;
}

export async function getOperationalMetrics(timeWindowMinutes: number = 60): Promise<AIOperationalMetrics> {
  try {
    const supabase = await getSupabaseAdmin();
    const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();

    const { data: logs, error } = await supabase
      .from('ai_task_logs')
      .select('*')
      .gte('created_at', cutoffTime);

    if (error || !logs) {
      logger.error('Failed to fetch AI operational metrics', { error });
      return getDefaultMetrics();
    }

    const actions = logs as any[];
    if (actions.length === 0) {
      return getDefaultMetrics();
    }

    const metrics: AIOperationalMetrics = {
      totalActions: actions.length,
      averageLatencyMs: actions.reduce((sum, a) => sum + (a.latency_ms || 0), 0) / actions.length,
      totalTokensUsed:
        actions.reduce((sum, a) => sum + (a.input_tokens || 0) + (a.output_tokens || 0), 0) || 0,
      totalCostUsd: actions.reduce((sum, a) => sum + (a.cost_estimate_usd || 0), 0),
      failureRate: actions.filter((a) => a.status === 'failed').length / actions.length,
      averageConfidenceScore: 0.85, // Placeholder - would need to extract from metadata
      actionsByModel: countBy(actions, (a) => a.model || 'unknown'),
      actionsByPromptType: countBy(actions, (a) => (a.metadata as any)?.promptType || 'unknown'),
      actionsByWorkflow: countBy(actions, (a) => (a.metadata as any)?.workflowSource || 'unknown'),
      highConfidenceActions: actions.filter((a) => (a.metadata as any)?.confidenceScore >= 0.8).length,
      failedActions: actions.filter((a) => a.status === 'failed').length,
    };

    return metrics;
  } catch (error) {
    logger.error('Exception fetching operational metrics', {
      error: error instanceof Error ? error.message : String(error),
    });
    return getDefaultMetrics();
  }
}

function countBy(items: any[], keyFn: (item: any) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function getDefaultMetrics(): AIOperationalMetrics {
  return {
    totalActions: 0,
    averageLatencyMs: 0,
    totalTokensUsed: 0,
    totalCostUsd: 0,
    failureRate: 0,
    averageConfidenceScore: 0,
    actionsByModel: {},
    actionsByPromptType: {},
    actionsByWorkflow: {},
    highConfidenceActions: 0,
    failedActions: 0,
  };
}

export async function trackAIExecutionStart(
  workflowSource: string,
  promptType: string,
  merchantId?: string
): Promise<{ executionId: string; startTime: number }> {
  return {
    executionId: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    startTime: Date.now(),
  };
}

export async function trackAIExecutionComplete(
  executionId: string,
  startTime: number,
  result: {
    modelUsed: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    confidenceScore: number;
  },
  metadata: {
    promptType: string;
    workflowSource: string;
    merchantId?: string;
    dealId?: string;
  }
): Promise<void> {
  const latencyMs = Date.now() - startTime;

  await logAIAction({
    modelUsed: result.modelUsed,
    executionLatencyMs: latencyMs,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCostUsd: result.estimatedCostUsd,
    retryCount: 0,
    confidenceScore: result.confidenceScore,
    promptType: metadata.promptType as any,
    workflowSource: metadata.workflowSource,
    metadata: { executionId },
    ...(metadata.merchantId ? { merchantId: metadata.merchantId } : {}),
    ...(metadata.dealId ? { dealId: metadata.dealId } : {}),
  });
}

export async function trackAIExecutionFailure(
  executionId: string,
  startTime: number,
  error: Error,
  metadata: {
    modelUsed: string;
    promptType: string;
    workflowSource: string;
    retryCount: number;
    merchantId?: string;
  }
): Promise<void> {
  const latencyMs = Date.now() - startTime;

  await logAIAction({
    modelUsed: metadata.modelUsed,
    executionLatencyMs: latencyMs,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    failureReason: error.message,
    retryCount: metadata.retryCount,
    confidenceScore: 0,
    promptType: metadata.promptType as any,
    workflowSource: metadata.workflowSource,
    metadata: { executionId, error: error.message },
    ...(metadata.merchantId ? { merchantId: metadata.merchantId } : {}),
  });
}
