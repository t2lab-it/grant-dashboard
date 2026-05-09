import { defaultBalanceRateThresholds } from "../lib/executionRate";

export type YearEndRiskKind =
  | "overdue_planned"
  | "excess_balance"
  | "low_balance"
  | "negative_balance";

export type YearEndRiskFund = {
  fundId: number;
  fundName: string;
  awardedAmount: number;
  plannedBalance: number;
  plannedBalanceRate: number | null;
  overduePlannedAmount: number;
  riskKinds: YearEndRiskKind[];
};

export type YearEndRiskSummary = {
  plannedBalance: number;
  riskFundCount: number;
  risks: YearEndRiskFund[];
};

type YearEndRiskSourceFund = {
  id: number;
  name: string;
  awarded_amount: number;
  freeBalance: number;
};

export type YearEndRiskThresholds = {
  excessBalanceRate: number;
  lowBalanceRate: number;
};

export const defaultYearEndRiskThresholds: YearEndRiskThresholds = {
  excessBalanceRate: defaultBalanceRateThresholds.notice,
  lowBalanceRate: defaultBalanceRateThresholds.warning,
};

const MAX_RISK_FUNDS = 5;

function getPlannedBalanceRate(fund: YearEndRiskSourceFund) {
  if (fund.awarded_amount <= 0) {
    return null;
  }

  return (fund.freeBalance / fund.awarded_amount) * 100;
}

function getRiskKinds(
  fund: YearEndRiskSourceFund,
  overduePlannedAmount: number,
  thresholds: YearEndRiskThresholds,
): YearEndRiskKind[] {
  const plannedBalanceRate = getPlannedBalanceRate(fund);
  const riskKinds: YearEndRiskKind[] = [];

  if (overduePlannedAmount > 0) {
    riskKinds.push("overdue_planned");
  }

  if (fund.freeBalance < 0) {
    riskKinds.push("negative_balance");
  } else if (plannedBalanceRate !== null && plannedBalanceRate < thresholds.lowBalanceRate) {
    riskKinds.push("low_balance");
  } else if (plannedBalanceRate !== null && plannedBalanceRate >= thresholds.excessBalanceRate) {
    riskKinds.push("excess_balance");
  }

  return riskKinds;
}

function getRiskSeverity(risk: YearEndRiskFund) {
  if (risk.riskKinds.includes("negative_balance")) {
    return 0;
  }

  if (risk.riskKinds.includes("overdue_planned")) {
    return 1;
  }

  if (risk.riskKinds.includes("low_balance")) {
    return 2;
  }

  return 3;
}

function compareYearEndRiskFunds(left: YearEndRiskFund, right: YearEndRiskFund) {
  const severityDelta = getRiskSeverity(left) - getRiskSeverity(right);
  if (severityDelta !== 0) {
    return severityDelta;
  }

  const overdueDelta = right.overduePlannedAmount - left.overduePlannedAmount;
  if (overdueDelta !== 0) {
    return overdueDelta;
  }

  return Math.abs(right.plannedBalance) - Math.abs(left.plannedBalance);
}

export function buildYearEndRiskSummary(
  funds: YearEndRiskSourceFund[],
  overduePlannedAmountByFundId: Map<number, number>,
  thresholds: YearEndRiskThresholds,
): YearEndRiskSummary {
  const riskFunds = funds
    .map((fund): YearEndRiskFund | null => {
      const overduePlannedAmount = overduePlannedAmountByFundId.get(fund.id) ?? 0;
      const riskKinds = getRiskKinds(fund, overduePlannedAmount, thresholds);

      if (riskKinds.length === 0) {
        return null;
      }

      return {
        fundId: fund.id,
        fundName: fund.name,
        awardedAmount: fund.awarded_amount,
        plannedBalance: fund.freeBalance,
        plannedBalanceRate: getPlannedBalanceRate(fund),
        overduePlannedAmount,
        riskKinds,
      };
    })
    .filter((risk): risk is YearEndRiskFund => risk !== null)
    .sort(compareYearEndRiskFunds);

  return {
    plannedBalance: funds.reduce((sum, fund) => sum + fund.freeBalance, 0),
    riskFundCount: riskFunds.length,
    risks: riskFunds.slice(0, MAX_RISK_FUNDS),
  };
}
