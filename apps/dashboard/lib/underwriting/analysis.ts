import type {
  DepositPatternAnalysis,
  MonthlyBankPeriod,
  NsfRiskScore,
  RevenueAnalysis,
  RevenueTrend,
  RiskTier,
  TransferRiskAnalysis,
  UnderwritingProfile
} from "./types";

export function analyzeRevenue(profile: UnderwritingProfile): RevenueAnalysis {
  const periods = normalizedPeriods(profile);
  const deposits = periods.map((period) => period.deposits).filter((value) => value > 0);
  const latestMonthlyDeposits = deposits.at(-1) ?? profile.monthlyDeposits;
  const averageMonthlyDeposits = deposits.length > 0
    ? deposits.reduce((sum, value) => sum + value, 0) / deposits.length
    : profile.monthlyRevenue ?? profile.monthlyDeposits;

  const volatilityRatio = calculateVolatilityRatio(deposits);
  const trend = calculateRevenueTrend(deposits, volatilityRatio);
  const revenueScore = clampScore(
    35 +
    Math.min(35, averageMonthlyDeposits / 2000) +
    (trend === "increasing" ? 15 : trend === "stable" ? 10 : trend === "declining" ? -10 : 0) -
    Math.min(25, volatilityRatio * 40)
  );

  return {
    averageMonthlyDeposits: Math.round(averageMonthlyDeposits),
    latestMonthlyDeposits: Math.round(latestMonthlyDeposits),
    trend,
    volatilityRatio: Number(volatilityRatio.toFixed(2)),
    revenueScore
  };
}

export function scoreNsfRisk(periods: MonthlyBankPeriod[] = []): NsfRiskScore {
  const nsfCount = periods.reduce((sum, period) => sum + (period.nsfCount ?? 0), 0);
  const nsfRatePerMonth = periods.length > 0 ? nsfCount / periods.length : 0;
  const score = clampScore(100 - nsfRatePerMonth * 22);
  return {
    nsfCount,
    nsfRatePerMonth: Number(nsfRatePerMonth.toFixed(2)),
    score,
    tier: scoreToRiskTier(100 - score)
  };
}

export function analyzeDepositPatterns(periods: MonthlyBankPeriod[] = []): DepositPatternAnalysis {
  const deposits = periods.map((period) => period.deposits).filter((value) => value > 0);
  const volatilityRatio = calculateVolatilityRatio(deposits);
  const averageDailyBalances = periods
    .map((period) => period.averageDailyBalance)
    .filter((value): value is number => typeof value === "number");
  const averageDailyBalance = averageDailyBalances.length > 0
    ? Math.round(averageDailyBalances.reduce((sum, value) => sum + value, 0) / averageDailyBalances.length)
    : undefined;

  const flags = [
    volatilityRatio > 0.45 ? "high_deposit_volatility" : undefined,
    deposits.length > 0 && Math.min(...deposits) < Math.max(...deposits) * 0.35 ? "material_low_month" : undefined,
    averageDailyBalance !== undefined && averageDailyBalance < 1000 ? "low_average_daily_balance" : undefined
  ].filter((flag): flag is string => Boolean(flag));

  return {
    consistencyScore: clampScore(100 - volatilityRatio * 100),
    concentrationRisk: volatilityRatio > 0.55 ? "high" : volatilityRatio > 0.35 ? "medium" : "low",
    ...(averageDailyBalance !== undefined ? { averageDailyBalance } : {}),
    flags
  };
}

export function analyzeTransferRisk(periods: MonthlyBankPeriod[] = []): TransferRiskAnalysis {
  const totalTransfers = periods.reduce(
    (sum, period) => sum + (period.transferInCount ?? 0) + (period.transferOutCount ?? 0),
    0
  );
  const totalDeposits = periods.reduce((sum, period) => sum + Math.max(1, period.deposits), 0);
  const transferIntensity = periods.length > 0 ? totalTransfers / periods.length : 0;
  const transferToDepositSignal = totalTransfers / Math.max(1, totalDeposits / 10000);
  const score = clampScore(100 - transferIntensity * 4 - transferToDepositSignal * 1.5);

  const flags = [
    transferIntensity > 18 ? "high_transfer_frequency" : undefined,
    transferToDepositSignal > 20 ? "transfer_activity_high_relative_to_deposits" : undefined
  ].filter((flag): flag is string => Boolean(flag));

  return {
    transferIntensity: Number(transferIntensity.toFixed(2)),
    score,
    tier: scoreToRiskTier(100 - score),
    flags
  };
}

export function estimateApprovalProbability(input: {
  qualificationScore: number;
  riskTier: RiskTier;
  compatibleLenderCount: number;
  requestedAmount: number;
  averageMonthlyDeposits: number;
}): number {
  const riskMultiplier = { low: 1, medium: 0.82, high: 0.58, critical: 0.25 }[input.riskTier];
  const lenderLift = Math.min(0.18, input.compatibleLenderCount * 0.035);
  const affordabilityPenalty = Math.max(0, input.requestedAmount / Math.max(1, input.averageMonthlyDeposits * 1.5) - 1) * 0.18;
  return Number(Math.max(0.03, Math.min(0.96, input.qualificationScore / 100 * riskMultiplier + lenderLift - affordabilityPenalty)).toFixed(2));
}

export function calculateRiskTier(score: number): RiskTier {
  if (score >= 80) return "low";
  if (score >= 62) return "medium";
  if (score >= 42) return "high";
  return "critical";
}

function normalizedPeriods(profile: UnderwritingProfile) {
  return profile.bankPeriods?.length ? profile.bankPeriods : [{ period: "current", deposits: profile.monthlyDeposits }];
}

function calculateRevenueTrend(values: number[], volatilityRatio: number): RevenueTrend {
  if (values.length < 3) return "insufficient_data";
  if (volatilityRatio > 0.5) return "volatile";
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  const firstAverage = firstHalf.reduce((sum, value) => sum + value, 0) / firstHalf.length;
  const secondAverage = secondHalf.reduce((sum, value) => sum + value, 0) / secondHalf.length;
  const change = (secondAverage - firstAverage) / Math.max(1, firstAverage);
  if (change > 0.12) return "increasing";
  if (change < -0.12) return "declining";
  return "stable";
}

function calculateVolatilityRatio(values: number[]) {
  if (values.length < 2) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / values.length;
  return Math.sqrt(variance) / Math.max(1, average);
}

function scoreToRiskTier(riskScore: number): RiskTier {
  if (riskScore >= 68) return "critical";
  if (riskScore >= 45) return "high";
  if (riskScore >= 25) return "medium";
  return "low";
}

function clampScore(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)));
}
