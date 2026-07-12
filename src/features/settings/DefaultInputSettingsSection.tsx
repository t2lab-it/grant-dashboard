import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { buildOverviewApiPath, getFiscalYearFromSearch } from "../../app/fiscalYear";
import { apiGet } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import { useAppSettings } from "./AppSettings";

type OverviewResponse = {
  funds: Array<{ id: number; name: string }>;
};

type FundDetailResponse = {
  categories: Array<{ id: number; categoryName: string }>;
};

export function DefaultInputSettingsSection() {
  const location = useLocation();
  const requestedFiscalYear = getFiscalYearFromSearch(location.search);
  const {
    settings: { defaultFundId, defaultCategoryId },
    setDefaultFundId,
    setDefaultCategoryId,
  } = useAppSettings();
  const hasDefaultFund = defaultFundId !== null;
  const { data: overviewData } = useQuery({
    queryKey: queryKeys.overview.detail(requestedFiscalYear),
    queryFn: () => apiGet<OverviewResponse>(buildOverviewApiPath(requestedFiscalYear)),
  });
  const { data: fundDetailData } = useQuery({
    queryKey: queryKeys.fund.categoryOptions(defaultFundId),
    queryFn: () => apiGet<FundDetailResponse>(`/api/funds/${defaultFundId}`),
    enabled: hasDefaultFund,
  });

  useEffect(() => {
    if (!hasDefaultFund || defaultCategoryId === null || !fundDetailData) {
      return;
    }

    const hasMatchingCategory = fundDetailData.categories.some(
      (category) => category.id === defaultCategoryId,
    );
    if (!hasMatchingCategory) {
      setDefaultCategoryId(null);
    }
  }, [defaultCategoryId, fundDetailData, hasDefaultFund, setDefaultCategoryId]);

  return (
    <section className="settings-section">
      <h3>入力の既定値</h3>
      <div className="settings-option-grid">
        <fieldset className="settings-option-group">
          <legend>新規作成時の既定値</legend>
          <label className="budget-entry-field">
            <span>新規作成時の既定予算</span>
            <select
              aria-label="新規作成時の既定予算"
              value={defaultFundId === null ? "" : String(defaultFundId)}
              onChange={(event) =>
                setDefaultFundId(event.target.value.length > 0 ? Number(event.target.value) : null)
              }
            >
              <option value="">設定しない</option>
              {overviewData?.funds.map((fund) => (
                <option key={fund.id} value={String(fund.id)}>
                  {fund.name}
                </option>
              ))}
            </select>
          </label>
          <label className="budget-entry-field">
            <span>新規作成時の既定費目</span>
            <select
              aria-label="新規作成時の既定費目"
              disabled={!hasDefaultFund}
              value={defaultCategoryId === null ? "" : String(defaultCategoryId)}
              onChange={(event) =>
                setDefaultCategoryId(event.target.value.length > 0 ? Number(event.target.value) : null)
              }
            >
              <option value="">設定しない</option>
              {fundDetailData?.categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.categoryName}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      </div>
    </section>
  );
}
