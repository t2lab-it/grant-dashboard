import { parseAmountExpressionForPreview } from "../forms/amountExpression";

export function parseBudgetAmount(value: string) {
  if (value.trim().length === 0) {
    return 0;
  }

  return parseAmountExpressionForPreview(value);
}

export function buildFundBudgetSummary(amounts: string[], awardedAmount: string): FundBudgetSummaryValues {
  const parsedAwardedAmount = parseBudgetAmount(awardedAmount);
  const categoryTotal = amounts.reduce((sum, amount) => sum + parseBudgetAmount(amount), 0);

  return {
    awardedAmount: parsedAwardedAmount,
    categoryTotal,
  };
}

export type FundBudgetSummaryValues = {
  awardedAmount: number;
  categoryTotal: number;
};
