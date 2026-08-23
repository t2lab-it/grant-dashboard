import type { CrossAggregateCategory } from "./crossAggregateCategory";
import { listFiscalYearMonths } from "../lib/calendar";

export type MonthlyMovement = {
  month: string;
  plannedAmount: number;
  actualAmount: number;
};

export type MonthlySummaryAmounts = {
  budgetAmount: number;
  actualCumulativeAmount: number;
  actualAmount: number;
  plannedAmount: number;
  plannedRemainingAmount: number;
  spendAndPlannedCumulativeAmount: number;
  calculatedBalance: number;
};

export type MonthlySummaryFund = MonthlySummaryAmounts & {
  fundId: number;
  fundName: string;
};

export type MonthlySummaryCrossAggregateCategory = MonthlySummaryAmounts & {
  crossAggregateCategory: CrossAggregateCategory;
};

export type MonthlySummaryResponse = {
  fiscalYear: number;
  month: string;
  calculationBasis: "current_data";
  summary: MonthlySummaryAmounts;
  funds: MonthlySummaryFund[];
  crossAggregateCategories: MonthlySummaryCrossAggregateCategory[];
};

function normalizeFiscalYearMovements(fiscalYear: number, movements: MonthlyMovement[]) {
  const movementsByMonth = new Map<string, MonthlyMovement>();

  for (const movement of movements) {
    const current = movementsByMonth.get(movement.month) ?? {
      month: movement.month,
      plannedAmount: 0,
      actualAmount: 0,
    };
    current.plannedAmount += movement.plannedAmount;
    current.actualAmount += movement.actualAmount;
    movementsByMonth.set(movement.month, current);
  }

  return listFiscalYearMonths(fiscalYear).map(
    (month) => movementsByMonth.get(month) ?? { month, plannedAmount: 0, actualAmount: 0 },
  );
}

export function isMonthKey(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}

export function isFiscalYearMonth(fiscalYear: number, month: string) {
  return listFiscalYearMonths(fiscalYear).includes(month);
}

export function buildMonthlySummaryAmounts(
  budgetAmount: number,
  fiscalYear: number,
  month: string,
  movements: MonthlyMovement[],
): MonthlySummaryAmounts {
  const fiscalMovements = normalizeFiscalYearMovements(fiscalYear, movements);
  const monthIndex = fiscalMovements.findIndex((movement) => movement.month === month);

  if (monthIndex === -1) {
    throw new Error("Month is outside fiscal year");
  }

  const throughMonth = fiscalMovements.slice(0, monthIndex + 1);
  const fromMonth = fiscalMovements.slice(monthIndex);
  const selectedMovement = fiscalMovements[monthIndex];
  const actualCumulativeAmount = throughMonth.reduce((sum, movement) => sum + movement.actualAmount, 0);
  const plannedCumulativeAmount = throughMonth.reduce((sum, movement) => sum + movement.plannedAmount, 0);
  const spendAndPlannedCumulativeAmount = actualCumulativeAmount + plannedCumulativeAmount;

  return {
    budgetAmount,
    actualCumulativeAmount,
    actualAmount: selectedMovement.actualAmount,
    plannedAmount: selectedMovement.plannedAmount,
    plannedRemainingAmount: fromMonth.reduce((sum, movement) => sum + movement.plannedAmount, 0),
    spendAndPlannedCumulativeAmount,
    calculatedBalance: budgetAmount - spendAndPlannedCumulativeAmount,
  };
}

export function buildOverviewMonthlyStatus(
  budgetAmount: number,
  fiscalYear: number,
  movements: MonthlyMovement[],
) {
  let calculatedBalance = budgetAmount;

  return normalizeFiscalYearMovements(fiscalYear, movements).map((movement) => {
    calculatedBalance -= movement.plannedAmount + movement.actualAmount;

    return {
      month: movement.month,
      committed: movement.plannedAmount,
      actual: movement.actualAmount,
      balance: calculatedBalance,
    };
  });
}
