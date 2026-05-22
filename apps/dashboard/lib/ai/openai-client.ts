import OpenAI from 'openai';
import { readServerEnv } from '../env';
import { logger } from '../logger';
import { recordApiUsage } from '../api-usage';

interface AIRequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
  model?: string;
}

export interface AIExecutionMetrics {
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
  'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
  'gpt-3.5-turbo': { input: 0.0005 / 1000, output: 0.0015 / 1000 },
  'gpt-4o': { input: 0.005 / 1000, output: 0.015 / 1000 },
};

export class OpenAIProductionClient {
  private client: OpenAI;
  private defaultModel: string;
  private fallbackModel: string;

  constructor() {
    const env = readServerEnv();
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    });
    this.defaultModel = 'gpt-4o';
    this.fallbackModel = 'gpt-3.5-turbo';
  }

  private calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const costs = MODEL_COSTS[model] || MODEL_COSTS['gpt-3.5-turbo'];
    if (!costs) return 0;
    return inputTokens * costs.input + outputTokens * costs.output;
  }

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: AIRequestOptions = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? 3;
    const timeoutMs = options.timeoutMs ?? 30000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await Promise.race([
          fn(),
          new Promise<T>((_, reject) =>
            setTimeout(
              () => reject(new Error(`OpenAI request timeout after ${timeoutMs}ms`)),
              timeoutMs
            )
          ),
        ]);
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries - 1) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError || new Error('OpenAI request failed');
  }

  async completeStructuredJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: any,
    options: AIRequestOptions = {}
  ): Promise<{ result: T; metrics: AIExecutionMetrics }> {
    const model = options.model || this.defaultModel;
    const startTime = Date.now();

    try {
      const response = await this.executeWithRetry(
        () =>
          this.client.chat.completions.create({
            model,
            temperature: 0.3,
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'result',
                schema,
                strict: true,
              },
            },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
        options
      );

      const latencyMs = Date.now() - startTime;
      const resp = response as any;
      const content = resp.choices?.[0]?.message?.content || '{}';
      const inputTokens = resp.usage?.prompt_tokens || 0;
      const outputTokens = resp.usage?.completion_tokens || 0;
      const estimatedCostUsd = this.calculateCost(
        model,
        inputTokens,
        outputTokens
      );

      const result = JSON.parse(content) as T;

      logger.info('AI: structured JSON completion', {
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        estimatedCostUsd,
      });

      return {
        result,
        metrics: {
          model,
          inputTokens,
          outputTokens,
          latencyMs,
          estimatedCostUsd,
        },
      };
    } catch (error) {
      logger.error('AI: structured JSON completion failed', {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async complete(
    systemPrompt: string,
    userPrompt: string,
    options: AIRequestOptions = {}
  ): Promise<{ result: string; metrics: AIExecutionMetrics }> {
    const model = options.model || this.defaultModel;
    const startTime = Date.now();

    try {
      const response = await this.executeWithRetry(
        () =>
          this.client.chat.completions.create({
            model,
            temperature: 0.5,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
        options
      );

      const latencyMs = Date.now() - startTime;
      const resp = response as any;
      const result = resp.choices?.[0]?.message?.content || '';
      const inputTokens = resp.usage?.prompt_tokens || 0;
      const outputTokens = resp.usage?.completion_tokens || 0;
      const estimatedCostUsd = this.calculateCost(
        model,
        inputTokens,
        outputTokens
      );

      logger.info('AI: text completion', {
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        estimatedCostUsd,
      });

      return {
        result,
        metrics: {
          model,
          inputTokens,
          outputTokens,
          latencyMs,
          estimatedCostUsd,
        },
      };
    } catch (error) {
      logger.error('AI: text completion failed', {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async streamCompletion(
    systemPrompt: string,
    userPrompt: string,
    onChunk: (chunk: string) => void,
    options: AIRequestOptions = {}
  ): Promise<AIExecutionMetrics> {
    const model = options.model || this.defaultModel;
    const startTime = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = await this.executeWithRetry(
        () =>
          this.client.chat.completions.create({
            model,
            temperature: 0.5,
            stream: true,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
        options
      );

      const str = stream as any;
      for await (const event of str) {
        if ((event as any).choices?.[0]?.delta?.content) {
          onChunk((event as any).choices[0].delta.content);
        }
        if ((event as any).usage) {
          inputTokens = (event as any).usage.prompt_tokens;
          outputTokens = (event as any).usage.completion_tokens;
        }
      }

      const latencyMs = Date.now() - startTime;
      const estimatedCostUsd = this.calculateCost(
        model,
        inputTokens,
        outputTokens
      );

      logger.info('AI: stream completion', {
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        estimatedCostUsd,
      });

      return {
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        estimatedCostUsd,
      };
    } catch (error) {
      logger.error('AI: stream completion failed', {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async embedText(text: string): Promise<number[]> {
    try {
      const response = await this.executeWithRetry(() =>
        this.client.embeddings.create({
          model: 'text-embedding-3-small',
          input: text,
        })
      );
      const resp = response as any;
      return resp.data?.[0]?.embedding || [];
    } catch (error) {
      logger.error('AI: embedding failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  setDefaultModel(model: string): void {
    if (MODEL_COSTS[model]) {
      this.defaultModel = model;
    } else {
      logger.warn('AI: unknown model', { model });
    }
  }

  setFallbackModel(model: string): void {
    if (MODEL_COSTS[model]) {
      this.fallbackModel = model;
    }
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  getFallbackModel(): string {
    return this.fallbackModel;
  }
}

let globalClient: OpenAIProductionClient | null = null;

export function getOpenAIClient(): OpenAIProductionClient {
  if (!globalClient) {
    globalClient = new OpenAIProductionClient();
  }
  return globalClient;
}
