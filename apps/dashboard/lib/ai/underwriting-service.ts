import { z } from 'zod';
import { getOpenAIClient } from './openai-client';
import { UnderwritingSummarySchema, UnderwritingSummary, AIModelConfig } from './types';
import { logger } from '../logger';

interface UnderwritingInput {
  businessName: string;
  industryCode?: string;
  annualRevenue?: number;
  monthlyRevenue?: number;
  monthlyDeposits: number;
  requestedAmount: number;
  ownershipYears?: number;
  businessYears?: number;
  creditScoreRange?: string;
  bankStatementSummary?: string;
  previousFundingHistory?: string;
  additionalContext?: string;
}

export async function generateUnderwritingSummary(
  input: UnderwritingInput
): Promise<{ summary: UnderwritingSummary; metrics: any }> {
  const client = getOpenAIClient();

  const systemPrompt = `You are an expert MCA (Merchant Cash Advance) underwriter with deep knowledge of:
- Revenue analysis and stability assessment
- Merchant cash advance qualification criteria
- Risk scoring and deal structuring
- Lender requirements and compatibility
- Industry risk profiles

Analyze the provided merchant information and provide a comprehensive underwriting summary.`;

  const userPrompt = `Analyze this merchant for MCA funding:

Business Name: ${input.businessName}
Industry Code: ${input.industryCode || 'Unknown'}
Annual Revenue: ${input.annualRevenue ? `$${input.annualRevenue.toLocaleString()}` : 'Not provided'}
Monthly Revenue: ${input.monthlyRevenue ? `$${input.monthlyRevenue.toLocaleString()}` : 'Not provided'}
Monthly Bank Deposits: $${input.monthlyDeposits.toLocaleString()}
Requested Amount: $${input.requestedAmount.toLocaleString()}
Years in Business: ${input.businessYears || 'Unknown'}
Owner Tenure: ${input.ownershipYears || 'Unknown'} years
Credit Score Range: ${input.creditScoreRange || 'Not provided'}
Bank Statement Summary: ${input.bankStatementSummary || 'Not provided'}
Previous Funding: ${input.previousFundingHistory || 'No history'}

Additional Context: ${input.additionalContext || 'None'}

Provide a structured underwriting assessment including:
1. Qualification score (0-100)
2. Overall risk level
3. Estimated approval probability
4. Estimated appropriate funding amount
5. Recommended lender types
6. Key strengths and risks
7. Recommended approach
8. Whether manual review is needed
9. Executive summary`;

  try {
    const { result, metrics } = await client.completeStructuredJSON<UnderwritingSummary>(
      systemPrompt,
      userPrompt,
      {
        type: 'object',
        properties: {
          qualificationScore: { type: 'number' },
          overallRiskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'very_high'] },
          approvalProbability: { type: 'number' },
          estimatedFundingAmount: { type: 'number' },
          recommendedLenderTypes: { type: 'array', items: { type: 'string' } },
          keyStrengths: { type: 'array', items: { type: 'string' } },
          keyRisks: { type: 'array', items: { type: 'string' } },
          recommendedApproach: { type: 'string' },
          needsManualReview: { type: 'boolean' },
          summary: { type: 'string' },
        },
        required: [
          'qualificationScore',
          'overallRiskLevel',
          'approvalProbability',
          'estimatedFundingAmount',
          'recommendedLenderTypes',
          'keyStrengths',
          'keyRisks',
          'recommendedApproach',
          'needsManualReview',
          'summary',
        ],
      },
      { model: AIModelConfig.underwriting.model }
    );

    // Validate with Zod
    const validated = UnderwritingSummarySchema.parse(result);

    logger.info('Underwriting summary generated', {
      businessName: input.businessName,
      qualificationScore: validated.qualificationScore,
      riskLevel: validated.overallRiskLevel,
    });

    return { summary: validated, metrics };
  } catch (error) {
    logger.error('Failed to generate underwriting summary', {
      businessName: input.businessName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function analyzeRevenueStability(
  monthlyRevenues: number[]
): Promise<{ stability: 'stable' | 'declining' | 'volatile'; analysis: string }> {
  if (monthlyRevenues.length < 3) {
    return {
      stability: 'volatile',
      analysis: 'Insufficient data for stability analysis',
    };
  }

  const client = getOpenAIClient();
  const revenueString = monthlyRevenues.map((r) => `$${r.toLocaleString()}`).join(', ');

  const { result } = await client.complete(
    'You are a revenue analysis expert. Classify revenue stability.',
    `Analyze this revenue trend (monthly): ${revenueString}

Respond with ONLY: "stable" or "declining" or "volatile"`,
    { model: AIModelConfig.underwriting.model }
  );

  const classification = result.trim().toLowerCase() as 'stable' | 'declining' | 'volatile';
  return {
    stability: ['stable', 'declining', 'volatile'].includes(classification)
      ? classification
      : 'volatile',
    analysis: result,
  };
}

export async function estimateApprovalProbability(
  qualificationScore: number,
  riskLevel: string,
  lenderCount: number
): Promise<number> {
  const baseScore = qualificationScore / 100;
  const riskMap: Record<string, number> = {
    low: 1.0,
    medium: 0.85,
    high: 0.6,
    very_high: 0.3,
  };
  const riskMultiplier = riskMap[riskLevel] || 0.5;

  const lenderMultiplier = Math.min(lenderCount * 0.1, 0.5);

  return Math.min(0.95, baseScore * riskMultiplier + lenderMultiplier);
}
