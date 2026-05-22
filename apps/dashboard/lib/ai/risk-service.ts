import { getOpenAIClient } from './openai-client';
import { RiskAnalysisSchema, RiskAnalysis, AIModelConfig } from './types';
import { logger } from '../logger';

interface RiskInput {
  businessName: string;
  industryCode: string;
  monthlyDeposits: number;
  monthlyWithdrawals?: number;
  nsfCount?: number;
  largeTransfers?: number[];
  chargebacks?: number;
  businessYears: number;
  creditScore?: number;
  previousDefaults?: boolean;
  bankStatementAnalysis?: string;
  additionalContext?: string;
}

export async function analyzeMerchantRisk(input: RiskInput): Promise<{ risk: RiskAnalysis; metrics: any }> {
  const client = getOpenAIClient();

  const systemPrompt = `You are an expert financial risk analyst specializing in merchant cash advance lending. Analyze merchant risk based on:
- Banking behavior patterns
- Business stability indicators
- Fraud risk signals
- Default probability assessment
- Financial health metrics`;

  const userPrompt = `Analyze merchant risk profile:

Business: ${input.businessName}
Industry: ${input.industryCode}
Monthly Deposits: $${input.monthlyDeposits.toLocaleString()}
Monthly Withdrawals: $${input.monthlyWithdrawals?.toLocaleString() || 'Not provided'}
NSF Count (last 12m): ${input.nsfCount || 0}
Large Transfers: ${input.largeTransfers?.map((t) => `$${t.toLocaleString()}`).join(', ') || 'None noted'}
Chargebacks: ${input.chargebacks || 0}
Years in Business: ${input.businessYears}
Credit Score: ${input.creditScore || 'Not provided'}
Previous Defaults: ${input.previousDefaults ? 'Yes' : 'No'}
Bank Statement Analysis: ${input.bankStatementAnalysis || 'Standard analysis'}

Provide a comprehensive risk assessment including:
1. Risk score (0-100)
2. Risk level classification
3. Fraud indicators identified
4. Business health indicators
5. Financial stability assessment
6. Deposit pattern assessment
7. NSF frequency classification
8. Estimated monthly volume
9. Key risk factors
10. Mitigating factors
11. Recommendations`;

  try {
    const { result, metrics } = await client.completeStructuredJSON<RiskAnalysis>(
      systemPrompt,
      userPrompt,
      {
        type: 'object',
        properties: {
          riskScore: { type: 'number' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          fraudIndicators: { type: 'array', items: { type: 'string' } },
          businessHealthIndicators: { type: 'array', items: { type: 'string' } },
          financialStability: { type: 'string', enum: ['stable', 'declining', 'unstable'] },
          depositPatterns: { type: 'string', enum: ['normal', 'irregular', 'concerning'] },
          nsfFrequency: { type: 'string', enum: ['none', 'occasional', 'frequent'] },
          estimatedMonthlyVolume: { type: 'number' },
          riskFactors: { type: 'array', items: { type: 'string' } },
          mitigatingFactors: { type: 'array', items: { type: 'string' } },
          recommendations: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'riskScore',
          'riskLevel',
          'fraudIndicators',
          'businessHealthIndicators',
          'financialStability',
          'depositPatterns',
          'nsfFrequency',
          'estimatedMonthlyVolume',
          'riskFactors',
          'mitigatingFactors',
          'recommendations',
        ],
      },
      { model: AIModelConfig.riskAnalysis.model }
    );

    const validated = RiskAnalysisSchema.parse(result);

    logger.info('Risk analysis completed', {
      businessName: input.businessName,
      riskScore: validated.riskScore,
      riskLevel: validated.riskLevel,
    });

    return { risk: validated, metrics };
  } catch (error) {
    logger.error('Risk analysis failed', {
      businessName: input.businessName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function detectFraudSignals(bankingData: {
  monthlyDeposits: number[];
  withdrawalPatterns: string[];
  nsfEvents: number;
  largeTransfers: number[];
  accountAge: number;
}): Promise<{ fraudRisk: 'low' | 'medium' | 'high'; signals: string[] }> {
  const signals: string[] = [];

  // Variance check
  if (bankingData.monthlyDeposits.length > 1) {
    const mean = bankingData.monthlyDeposits.reduce((a, b) => a + b) / bankingData.monthlyDeposits.length;
    const variance = bankingData.monthlyDeposits.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / bankingData.monthlyDeposits.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev / mean > 0.8) {
      signals.push('High deposit volatility');
    }
  }

  if (bankingData.nsfEvents > 5) {
    signals.push('Frequent NSF events');
  }

  if (bankingData.largeTransfers.length > 3) {
    signals.push('Multiple large transfers');
  }

  if (bankingData.accountAge < 6) {
    signals.push('Recent account opening');
  }

  const fraudRisk = signals.length > 3 ? 'high' : signals.length > 1 ? 'medium' : 'low';

  logger.info('Fraud signals detected', { fraudRisk, signalCount: signals.length });

  return { fraudRisk, signals };
}

export async function classifyNSFRisk(nsfCount: number, monthsHistory: number): Promise<'none' | 'occasional' | 'frequent'> {
  const nsfRate = nsfCount / Math.max(monthsHistory, 1);

  if (nsfRate === 0) return 'none';
  if (nsfRate < 0.33) return 'occasional';
  return 'frequent';
}
