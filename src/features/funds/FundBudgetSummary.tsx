import { formatYen } from "../../lib/format";

export function parseBudgetAmount(value: string) {
  if (value.trim().length === 0) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildFundBudgetSummary(amounts: string[], awardedAmount: string): FundBudgetSummaryValues {
  const parsedAwardedAmount = parseBudgetAmount(awardedAmount);
  const categoryTotal = amounts.reduce((sum, amount) => sum + parseBudgetAmount(amount), 0);

  return {
    awardedAmount: parsedAwardedAmount,
    categoryTotal,
    balance: parsedAwardedAmount - categoryTotal,
  };
}

export type FundBudgetSummaryValues = {
  awardedAmount: number;
  categoryTotal: number;
  balance: number;
};

type FundBudgetSummaryProps = Pick<FundBudgetSummaryValues, "balance">;

export function FundBudgetSummary({
  balance,
}: FundBudgetSummaryProps) {
  return (
    <section aria-label="費目予算の合計確認" className="budget-form-summary">
      <dl className="budget-form-summary-grid">
        <div className="budget-form-summary-item">
          <dt>差額</dt>
          <dd>{formatYen(balance)}</dd>
        </div>
      </dl>
    </section>
  );
}
