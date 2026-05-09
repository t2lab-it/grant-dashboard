import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { formatAmount } from "../../lib/format";

type SearchTab = "all" | "overdue" | "unsettled" | "unlinked";
type SearchEntryType = "planned" | "actual";

type SearchResult = {
  id: number;
  type: SearchEntryType;
  fundId: number;
  fundName: string;
  categoryId: number;
  categoryName: string;
  date: string;
  month: string;
  description: string;
  notes: string;
  amount: number;
  remainingAmount: number | null;
  statusLabel: string;
  detailHref: string;
  auxiliaryLabels: Array<{ id: number; kind: "auxiliary"; name: string; color: string; inherited: boolean }>;
};

type SearchResponse = {
  selectedFiscalYear: number | null;
  filters: {
    funds: Array<{ id: number; name: string }>;
    categories: Array<{ id: number; fundId: number; name: string }>;
    auxiliaryLabels: Array<{ id: number; kind: "auxiliary"; name: string; color: string }>;
  };
  counts: Record<SearchTab, number>;
  resultLimit: number;
  totalResultCount: number;
  results: SearchResult[];
};

const TAB_LABELS: Array<{ value: SearchTab; label: string }> = [
  { value: "all", label: "検索結果" },
  { value: "overdue", label: "期限超過予定" },
  { value: "unsettled", label: "未精算予定" },
  { value: "unlinked", label: "未連携実績" },
];

function getSearchTab(value: string | null): SearchTab {
  return value === "overdue" || value === "unsettled" || value === "unlinked" ? value : "all";
}

function getSearchEntryType(value: string | null) {
  return value === "planned" || value === "actual" ? value : "";
}

function setOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value.length === 0 || (key === "tab" && value === "all")) {
    params.delete(key);
    return;
  }

  params.set(key, value);
}

function buildSearchApiPath(params: URLSearchParams) {
  const apiParams = new URLSearchParams();
  for (const key of [
    "year",
    "tab",
    "keyword",
    "fundId",
    "categoryId",
    "auxiliaryLabelId",
    "entryType",
    "monthFrom",
    "monthTo",
  ]) {
    const value = params.get(key);
    if (value !== null && value.length > 0) {
      apiParams.set(key, value);
    }
  }

  const search = apiParams.toString();
  return search ? `/api/search?${search}` : "/api/search";
}

function entryTypeLabel(type: SearchEntryType) {
  return type === "planned" ? "予定" : "実績";
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchPath = buildSearchApiPath(searchParams);
  const activeTab = getSearchTab(searchParams.get("tab"));
  const { data, isError } = useQuery({
    queryKey: ["search", searchPath],
    queryFn: () => apiGet<SearchResponse>(searchPath),
  });

  function updateFilter(key: string, value: string) {
    const nextParams = new URLSearchParams(searchParams);
    setOrDelete(nextParams, key, value);
    setSearchParams(nextParams);
  }

  function tabHref(tab: SearchTab) {
    const nextParams = new URLSearchParams(searchParams);
    setOrDelete(nextParams, "tab", tab);
    const search = nextParams.toString();
    return `/search${search ? `?${search}` : ""}`;
  }

  if (isError) {
    return <div>検索結果を読み込めませんでした。</div>;
  }

  const results = data?.results ?? [];
  const counts = data?.counts ?? { all: 0, overdue: 0, unsettled: 0, unlinked: 0 };
  const isTruncated = data !== undefined && data.totalResultCount > data.results.length;

  return (
    <section className="search-page" aria-labelledby="search-page-heading">
      <div className="search-page-header">
        <h2 id="search-page-heading">検索</h2>
      </div>

      <div className="search-filters" aria-label="検索条件">
        <label>
          キーワード
          <input
            type="search"
            value={searchParams.get("keyword") ?? ""}
            onChange={(event) => updateFilter("keyword", event.target.value)}
          />
        </label>
        <label>
          予算
          <select
            value={searchParams.get("fundId") ?? ""}
            onChange={(event) => updateFilter("fundId", event.target.value)}
          >
            <option value="">すべて</option>
            {data?.filters.funds.map((fund) => (
              <option key={fund.id} value={String(fund.id)}>
                {fund.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          費目
          <select
            value={searchParams.get("categoryId") ?? ""}
            onChange={(event) => updateFilter("categoryId", event.target.value)}
          >
            <option value="">すべて</option>
            {data?.filters.categories.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          補助ラベル
          <select
            value={searchParams.get("auxiliaryLabelId") ?? ""}
            onChange={(event) => updateFilter("auxiliaryLabelId", event.target.value)}
          >
            <option value="">すべて</option>
            {data?.filters.auxiliaryLabels.map((label) => (
              <option key={label.id} value={String(label.id)}>
                {label.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          種別
          <select
            value={getSearchEntryType(searchParams.get("entryType"))}
            onChange={(event) => updateFilter("entryType", event.target.value)}
          >
            <option value="">すべて</option>
            <option value="planned">予定</option>
            <option value="actual">実績</option>
          </select>
        </label>
        <label>
          開始月
          <input
            type="month"
            value={searchParams.get("monthFrom") ?? ""}
            onChange={(event) => updateFilter("monthFrom", event.target.value)}
          />
        </label>
        <label>
          終了月
          <input
            type="month"
            value={searchParams.get("monthTo") ?? ""}
            onChange={(event) => updateFilter("monthTo", event.target.value)}
          />
        </label>
      </div>

      <nav className="search-tabs" aria-label="確認対象">
        {TAB_LABELS.map((tab) => (
          <Link
            key={tab.value}
            className={`search-tab${activeTab === tab.value ? " search-tab-active" : ""}`}
            to={tabHref(tab.value)}
          >
            {tab.label} {counts[tab.value]}
          </Link>
        ))}
      </nav>

      {results.length === 0 ? (
        <p className="search-empty-state">条件に一致する項目はありません。</p>
      ) : (
        <>
          {isTruncated ? (
            <p className="search-result-limit">
              {data.totalResultCount}件中{data.resultLimit}件を表示しています。
            </p>
          ) : null}
          <div className="search-results" role="list" aria-label="検索結果">
            {results.map((result) => (
              <Link
                key={`${result.type}-${result.id}`}
                className="search-result-row"
                to={result.detailHref}
              >
                <span className={`search-result-type search-result-type-${result.type}`}>
                  {entryTypeLabel(result.type)}
                </span>
                <span className="search-result-main">
                  <strong>{result.description}</strong>
                  <span>
                    {result.fundName} / {result.categoryName} / {result.month}
                  </span>
                  {result.auxiliaryLabels.length > 0 ? (
                    <span className="search-result-labels">
                      {result.auxiliaryLabels.map((label) => (
                        <span key={label.id} className="classification-result-label">
                          {label.name}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <span className="search-result-status">{result.statusLabel}</span>
                <span className="search-result-amount">{formatAmount(result.amount, "grouped-yen")}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
