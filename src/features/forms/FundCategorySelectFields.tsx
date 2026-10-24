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
  fundId: string;
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
  fundId,
  funds,
  hasSelectedFund,
  isFundLocked = false,
  lockedFundName = "読み込み中...",
  onCategoryChange,
  onFundChange,
}: FundCategorySelectFieldsProps) {
  return (
    <div className="budget-field-group">
      <label className="budget-entry-field">
        <span>予算</span>
        {isFundLocked ? (
          <select aria-label="予算" disabled name="fundId" value={fundId}>
            <option value={fundId}>{lockedFundName}</option>
          </select>
        ) : (
          <select
            aria-label="予算"
            name="fundId"
            onChange={(event) => onFundChange(event.target.value)}
            value={fundId}
          >
            <option value="">予算を選択してください</option>
            {funds.map((fund) => (
              <option key={fund.id} value={String(fund.id)}>
                {fund.name}
              </option>
            ))}
          </select>
        )}
      </label>
      <label className="budget-entry-field">
        <span>費目</span>
        <select
          aria-label="費目"
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
    </div>
  );
}
