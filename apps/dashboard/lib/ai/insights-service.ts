import { getOpenAIClient } from './openai-client';
import { OperationalInsightSchema, OperationalInsight, BankingPatternsSchema, BankingPatterns, AIModelConfig } from './types';
import { logger } from '../logger';

interface OperationalDataInput {
  totalSubmissions: number;
  approvalsThisMonth: number;
  declinesThisMonth: number;
  averageUnderwritingTime: number;
  averageRoutingTime: number;
  lenderPerformanceData: { lenderId: string; approvalRate: number }[];
  workflowFailureRate: number;
  staleDealsCount: number;
  underwritingBottlenecksData: string;
}

export async function generateOperationalInsights(data: OperationalDataInput): Promise<{ insights: OperationalInsight[]; metrics: any }> {
  const client = getOpenAIClient();

  const systemPrompt = `You are an operational intelligence analyst for an MCA platform. Identify key operational insights including:
- Underwriting process bottlenecks
- Lender performance anomalies
- Fraud pattern trends
- Market opportunities
- Process improvement opportunities
- Risk concentration areas`;

  const userPrompt = `Analyze this operational data and identify key insights:

This Month:
- Total Submissions: ${data.totalSubmissions}
- Approvals: ${data.approvalsThisMonth}
- Declines: ${data.declinesThisMonth}
- Approval Rate: ${((data.approvalsThisMonth / Math.max(data.totalSubmissions, 1)) * 100).toFixed(1)}%
- Average Underwriting Time: ${data.averageUnderwritingTime} hours
- Average Routing Time: ${data.averageRoutingTime} hours
- Workflow Failure Rate: ${(data.workflowFailureRate * 100).toFixed(1)}%
- Stale Deals: ${data.staleDealsCount}

Lender Performance:
${data.lenderPerformanceData.map((l) => `- Lender: ${l.lenderId}, Approval Rate: ${(l.approvalRate * 100).toFixed(1)}%`).join('\n')}

Bottlenecks Identified:
${data.underwritingBottlenecksData}

Provide 3-5 key insights with priority levels and recommended actions.`;

  try {
    const { result, metrics } = await client.complete(
      systemPrompt,
      userPrompt,
      { model: AIModelConfig.operationalInsights.model }
    );

    const insights = parseOperationalInsights(result);

    logger.info('Operational insights generated', { insightCount: insights.length });

    return { insights, metrics };
  } catch (error) {
    logger.error('Operational insights generation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function parseOperationalInsights(analysisText: string): OperationalInsight[] {
  const insights: OperationalInsight[] = [];

  // Simple parsing logic to extract insights from AI response
  const lines = analysisText.split('\n').filter((line) => line.trim().length > 0);

  for (const line of lines) {
    if (line.includes('bottleneck') || line.includes('Bottleneck')) {
      insights.push({
        insightType: 'underwriting_bottleneck',
        priority: 'high',
        description: line,
        dataPoints: [],
        recommendedAction: 'Investigate and optimize',
        estimatedImpact: 'Process efficiency',
        affectedMetrics: ['underwriting_speed', 'throughput'],
      });
    } else if (line.includes('fraud') || line.includes('Fraud')) {
      insights.push({
        insightType: 'fraud_pattern',
        priority: 'critical',
        description: line,
        dataPoints: [],
        recommendedAction: 'Enhanced review protocols',
        estimatedImpact: 'Risk reduction',
        affectedMetrics: ['approval_rate', 'default_rate'],
      });
    }
  }

  return insights.slice(0, 5);
}

interface BankingDataInput {
  monthlyDeposits: number[];
  largeTransfers: number[];
  nsfEvents: number;
  businessCycle: string;
  unusualActivityNotes: string[];
}

export async function summarizeBankingPatterns(data: BankingDataInput): Promise<{ patterns: BankingPatterns; metrics: any }> {
  const client = getOpenAIClient();

  const avgDeposit = data.monthlyDeposits.length > 0 ? data.monthlyDeposits.reduce((a, b) => a + b) / data.monthlyDeposits.length : 0;
  const minDeposit = Math.min(...data.monthlyDeposits);
  const maxDeposit = Math.max(...data.monthlyDeposits);

  const systemPrompt = `You are a banking pattern analysis expert. Analyze merchant banking data to identify:
- Deposit stability and trends
- Transfer patterns
- Business cycle indicators
- Risk signals
- Health assessment`;

  const userPrompt = `Analyze these banking patterns:

Monthly Deposits: ${data.monthlyDeposits.map((d) => `$${d.toLocaleString()}`).join(', ')}
Average Daily: $${avgDeposit.toLocaleString()}
Min Month: $${minDeposit.toLocaleString()}
Max Month: $${maxDeposit.toLocaleString()}
Large Transfers: ${data.largeTransfers.map((t) => `$${t.toLocaleString()}`).join(', ')}
NSF Events: ${data.nsfEvents}
Business Cycle: ${data.businessCycle}
Unusual Activity: ${data.unusualActivityNotes.join('; ') || 'None noted'}

Provide assessment including volatility, cycle patterns, risk flags, and health rating.`;

  try {
    const { result, metrics } = await client.complete(
      systemPrompt,
      userPrompt,
      { model: AIModelConfig.bankingPatterns.model }
    );

    const patterns: BankingPatterns = {
      averageDailyDeposit: avgDeposit,
      depositVolatility: calculateVolatility(data.monthlyDeposits),
      largestDepositDay: maxDeposit,
      smallestDepositDay: minDeposit,
      frequentTransferSizes: data.largeTransfers.slice(0, 3),
      unusualActivity: data.unusualActivityNotes,
      businessCyclePattern: data.businessCycle,
      estimatedAnnualVolume: avgDeposit * 365,
      healthAssessment: extractHealthAssessment(result),
      riskFlags: extractRiskFlags(result),
    };

    logger.info('Banking patterns summarized', {
      averageDeposit: avgDeposit,
      volatility: patterns.depositVolatility,
    });

    return { patterns, metrics };
  } catch (error) {
    logger.error('Banking patterns analysis failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function calculateVolatility(deposits: number[]): 'low' | 'medium' | 'high' {
  if (deposits.length < 2) return 'low';

  const mean = deposits.reduce((a, b) => a + b) / deposits.length;
  const variance = deposits.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / deposits.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / mean;

  if (coefficientOfVariation < 0.2) return 'low';
  if (coefficientOfVariation < 0.5) return 'medium';
  return 'high';
}

function extractHealthAssessment(analysisText: string): string {
  if (analysisText.toLowerCase().includes('healthy') || analysisText.toLowerCase().includes('stable')) {
    return 'Stable and healthy';
  }
  if (analysisText.toLowerCase().includes('concerning') || analysisText.toLowerCase().includes('risk')) {
    return 'Has concerning indicators';
  }
  return 'Moderate health profile';
}

function extractRiskFlags(analysisText: string): string[] {
  const flags: string[] = [];

  if (analysisText.toLowerCase().includes('volatile') || analysisText.toLowerCase().includes('volatility')) {
    flags.push('Volatile deposits');
  }
  if (analysisText.toLowerCase().includes('decline') || analysisText.toLowerCase().includes('declining')) {
    flags.push('Declining trend');
  }
  if (analysisText.toLowerCase().includes('unusual') || analysisText.toLowerCase().includes('suspicious')) {
    flags.push('Unusual activity');
  }

  return flags;
}
