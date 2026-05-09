type FundListFiltersProps = {
  ariaLabel?: string;
  categoryOptions: string[];
  searchText: string;
  selectedCategory: string;
  onSearchTextChange: (value: string) => void;
  onSelectedCategoryChange: (value: string) => void;
};

export function FundListFilters({
  ariaLabel = "一覧の絞り込み",
  categoryOptions,
  searchText,
  selectedCategory,
  onSearchTextChange,
  onSelectedCategoryChange,
}: FundListFiltersProps) {
  return (
    <div className="detail-list-filters" role="group" aria-label={ariaLabel}>
      <input
        className="detail-list-filter-input"
        type="text"
        aria-label="検索"
        value={searchText}
        placeholder="内容・費目で検索"
        onChange={(event) => onSearchTextChange(event.target.value)}
      />
      <select
        className="detail-list-filter-select"
        aria-label="費目"
        value={selectedCategory}
        onChange={(event) => onSelectedCategoryChange(event.target.value)}
      >
        <option value="">すべての費目</option>
        {categoryOptions.map((categoryName) => (
          <option key={categoryName} value={categoryName}>
            {categoryName}
          </option>
        ))}
      </select>
    </div>
  );
}
