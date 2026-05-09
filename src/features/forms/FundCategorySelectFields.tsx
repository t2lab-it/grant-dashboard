type FundOption = {
  id: number;
  name: string;
};

type CategoryOption = {
  id: number;
  categoryName: string;
};

type FundCategorySelectFieldsProps = {
  categories: CategoryOption[];
  categoryId: string;
  categoryLabel?: string;
  fundId: string;
  fundLabel?: string;
  funds: FundOption[];
  hasSelectedFund: boolean;
  isFundLocked?: boolean;
  lockedFundName?: string;
  onCategoryChange: (value: string) => void;
  onFundChange: (value: string) => void;
};

export function FundCategorySelectFields({
  categories,
  categoryId,
  categoryLabel = "費目",
  fundId,
  fundLabel = "資金",
  funds,
  hasSelectedFund,
  isFundLocked = false,
  lockedFundName = "読み込み中...",
  onCategoryChange,
  onFundChange,
}: FundCategorySelectFieldsProps) {
  return (
    <>
      <label className="budget-entry-field">
        <span>{fundLabel}</span>
        {isFundLocked ? (
          <select aria-label={fundLabel} disabled name="fundId" value={fundId}>
            <option value={fundId}>{lockedFundName}</option>
          </select>
        ) : (
          <select
            aria-label={fundLabel}
            name="fundId"
            onChange={(event) => onFundChange(event.target.value)}
            value={fundId}
          >
            <option value="">資金を選択してください</option>
            {funds.map((fund) => (
              <option key={fund.id} value={String(fund.id)}>
                {fund.name}
              </option>
            ))}
          </select>
        )}
      </label>
      <label className="budget-entry-field">
        <span>{categoryLabel}</span>
        <select
          aria-label={categoryLabel}
          disabled={!hasSelectedFund}
          name="categoryId"
          onChange={(event) => onCategoryChange(event.target.value)}
          value={categoryId}
        >
          <option value="">費目を選択してください</option>
          {categories.map((category) => (
            <option key={category.id} value={String(category.id)}>
              {category.categoryName}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
