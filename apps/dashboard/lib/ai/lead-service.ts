import { getOpenAIClient } from './openai-client';
import { LeadQualificationSchema, LeadQualification, AIModelConfig } from './types';
import { logger } from '../logger';

interface LeadInput {
  businessName: string;
  industry: string;
  monthlyDeposits: number;
  requestedAmount: number;
  qualificationScore: number;
  riskLevel: string;
  businessYears: number;
  ownerCreditScore?: number;
  previousFundingSuccess?: boolean;
  urgentNeed?: boolean;
  seasonalBusiness?: boolean;
  additionalContext?: string;
}

export async function classifyLeadQuality(input: LeadInput): Promise<{ qualification: LeadQualification; metrics: any }> {
  const client = getOpenAIClient();

  const systemPrompt = `You are an expert lead qualification specialist for MCA funding. Evaluate leads based on:
- Deal quality and fit
- Funding feasibility
- Closing probability
- Urgency and timeline
- Competitive risk
- Follow-up strategy`;

  const userPrompt = `Classify this lead for MCA funding:

Business: ${input.businessName}
Industry: ${input.industry}
Monthly Deposits: $${input.monthlyDeposits.toLocaleString()}
Requested Amount: $${input.requestedAmount.toLocaleString()}
Qualification Score: ${input.qualificationScore}
Risk Level: ${input.riskLevel}
Years in Business: ${input.businessYears}
Owner Credit Score: ${input.ownerCreditScore || 'Not provided'}
Previous Funding Success: ${input.previousFundingSuccess ? 'Yes' : 'No'}
Urgent Need: ${input.urgentNeed ? 'Yes' : 'No'}
Seasonal Business: ${input.seasonalBusiness ? 'Yes' : 'No'}

Context: ${input.additionalContext || 'Standard qualification'}

Provide a lead quality assessment including:
1. Quality score (0-100)
2. Tier classification (A/B/C/D)
3. Recommended action (immediate/follow_up/nurture/pass)
4. Estimated closing probability
5. Urgency level
6. Next steps to pursue
7. Follow-up timing recommendation
8. Estimated deal size
9. Industry risk assessment
10. Competitive threats`;

  try {
    const { result, metrics } = await client.completeStructuredJSON<LeadQualification>(
      systemPrompt,
      userPrompt,
      {
        type: 'object',
        properties: {
          qualityScore: { type: 'number' },
          tier: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          recommendedAction: { type: 'string', enum: ['immediate', 'follow_up', 'nurture', 'pass'] },
          estimatedClosingProbability: { type: 'number' },
          urgencyLevel: { type: 'string', enum: ['high', 'medium', 'low'] },
          nextSteps: { type: 'array', items: { type: 'string' } },
          followUpTiming: { type: ['string', 'null'] },
          estimatedDealSize: { type: 'number' },
          industryRisk: { type: 'string', enum: ['low', 'medium', 'high'] },
          competitiveThreats: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'qualityScore',
          'tier',
          'recommendedAction',
          'estimatedClosingProbability',
          'urgencyLevel',
          'nextSteps',
          'followUpTiming',
          'estimatedDealSize',
          'industryRisk',
          'competitiveThreats',
        ],
      },
      { model: AIModelConfig.leadQualification.model }
    );

    const validated = LeadQualificationSchema.parse(result);

    logger.info('Lead classified', {
      businessName: input.businessName,
      tier: validated.tier,
      qualityScore: validated.qualityScore,
    });

    return { qualification: validated, metrics };
  } catch (error) {
    logger.error('Lead classification failed', {
      businessName: input.businessName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function calculateTierFromScore(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

export function calculateUrgencyFromFactors(
  needsUrgent: boolean,
  closingProbability: number
): 'high' | 'medium' | 'low' {
  if (needsUrgent && closingProbability > 0.7) return 'high';
  if (closingProbability > 0.6) return 'medium';
  return 'low';
}
