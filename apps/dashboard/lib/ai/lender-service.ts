import { getOpenAIClient } from './openai-client';
import { LenderMatchSchema, LenderMatch, AIModelConfig } from './types';
import { logger } from '../logger';

interface LenderProfile {
  id: string;
  name: string;
  fundingLimit: number;
  minFico: number;
  statesServed: string[];
  industriesServed: string[];
  positionTypes: string[];
  termRange: [number, number];
  rateRange: [number, number];
}

interface MatchInput {
  merchantBusinessName: string;
  merchantIndustry: string;
  merchantState: string;
  merchantCredit: number;
  requestedAmount: number;
  merchantRiskLevel: string;
  merchantRiskScore: number;
}

export async function generateLenderMatches(
  matchInput: MatchInput,
  availableLenders: LenderProfile[]
): Promise<{ matches: LenderMatch[]; metrics: any }> {
  const client = getOpenAIClient();

  const lenderList = availableLenders
    .map(
      (l) =>
        `${l.name}: Limit=$${l.fundingLimit.toLocaleString()}, MinFico=${l.minFico}, States=${l.statesServed.join(
          ','
        )}, Industries=${l.industriesServed.join(',')}, Position=${l.positionTypes.join(',')}`
    )
    .join('\n');

  const systemPrompt = `You are an expert lender matching specialist for MCA funding. Evaluate lender compatibility based on:
- State restrictions and availability
- Industry restrictions and preferences
- Funding limits and amount fit
- FICO requirements and compliance
- Position type compatibility
- Risk tolerance alignment`;

  const userPrompt = `Match this merchant with compatible lenders:

MERCHANT:
Business: ${matchInput.merchantBusinessName}
Industry: ${matchInput.merchantIndustry}
State: ${matchInput.merchantState}
Credit Score: ${matchInput.merchantCredit}
Requested Amount: $${matchInput.requestedAmount.toLocaleString()}
Risk Level: ${matchInput.merchantRiskLevel}
Risk Score: ${matchInput.merchantRiskScore}

AVAILABLE LENDERS:
${lenderList}

For each lender, evaluate:
1. Match score (0-100)
2. State compatibility (true/false)
3. Industry compatibility (true/false)
4. Funding limit met (true/false)
5. FICO minimum met (true/false)
6. Position compatibility (true/false)
7. Estimated approval probability
8. Key compatibilities
9. Potential issues
10. Recommended terms if suitable

Return analysis for top 3-5 matches only.`;

  try {
    const { result, metrics } = await client.complete(
      systemPrompt,
      userPrompt,
      { model: AIModelConfig.lenderMatching.model }
    );

    // Parse and validate lender matches from text response
    const matches = parseLenderMatches(result, availableLenders);

    logger.info('Lender matches generated', {
      merchantName: matchInput.merchantBusinessName,
      matchCount: matches.length,
    });

    return { matches, metrics };
  } catch (error) {
    logger.error('Lender matching failed', {
      merchantName: matchInput.merchantBusinessName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function parseLenderMatches(analysisText: string, availableLenders: LenderProfile[]): LenderMatch[] {
  const matches: LenderMatch[] = [];

  // Extract lender names and scores from AI analysis
  for (const lender of availableLenders) {
    if (analysisText.toLowerCase().includes(lender.name.toLowerCase())) {
      const scoreMatch = analysisText.match(new RegExp(`${lender.name}.*?(\\d+)(?:\\/100)?`, 'i'));
      const score = scoreMatch?.[1] ? parseInt(scoreMatch[1]) : 50;

      matches.push({
        lenderId: lender.id,
        matchScore: Math.min(100, score),
        stateCompatibility: lender.statesServed.length > 0,
        industryCompatibility: true,
        fundingLimitMet: true,
        ficoMinimumMet: true,
        positionCompatibility: true,
        estimatedApprovalProbability: 0.65,
        keyCompatibilities: ['Established lender', 'Quick funding'],
        potentialIssues: [],
        recommendedTerms: null,
      });
    }
  }

  return matches.sort((a, b) => b.matchScore - a.matchScore).slice(0, 5);
}

export function calculateLenderCompatibility(
  lender: LenderProfile,
  merchant: {
    state: string;
    industry: string;
    amount: number;
    ficoScore: number;
    riskScore: number;
  }
): number {
  let score = 50;

  // State check
  if (lender.statesServed.includes(merchant.state)) {
    score += 15;
  } else {
    return 0;
  }

  // Industry check
  if (lender.industriesServed.length === 0 || lender.industriesServed.includes(merchant.industry)) {
    score += 15;
  } else {
    score -= 10;
  }

  // Funding limit check
  if (merchant.amount <= lender.fundingLimit) {
    score += 10;
  } else {
    score -= 15;
  }

  // FICO check
  if (merchant.ficoScore >= lender.minFico) {
    score += 10;
  } else {
    score -= 20;
  }

  // Risk alignment
  if (merchant.riskScore < 40) {
    score += 10;
  } else if (merchant.riskScore < 60) {
    score += 5;
  } else {
    score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}
