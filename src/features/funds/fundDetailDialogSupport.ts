import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { buildOverviewApiPath } from "../../app/fiscalYear";

type OverviewResponse = {
  funds: Array<{
    id: number;
    name: string;
  }>;
};

type FundCategoryOptionsResponse = {
  categories: Array<{
    id: number;
    categoryName: string;
  }>;
};

export function useBudgetTargetOptions(selectedFundId: string, fiscalYear: number, enabled: boolean) {
  const parsedFundId = selectedFundId.trim().length > 0 ? Number(selectedFundId) : Number.NaN;
  const hasSelectedFund = Number.isInteger(parsedFundId) && parsedFundId > 0;
  const { data: overviewData } = useQuery({
    queryKey: ["overview", fiscalYear],
    queryFn: () => apiGet<OverviewResponse>(buildOverviewApiPath(fiscalYear)),
    enabled,
  });
  const categoryOptionsQuery = useQuery({
    queryKey: ["fund-category-options", parsedFundId],
    queryFn: () => apiGet<FundCategoryOptionsResponse>(`/api/funds/${parsedFundId}`),
    enabled: enabled && hasSelectedFund,
  });

  return {
    funds: overviewData?.funds ?? [],
    categories: categoryOptionsQuery.data?.categories ?? [],
    areCategoriesLoaded: !enabled || !hasSelectedFund || categoryOptionsQuery.isSuccess,
    hasSelectedFund,
  };
}
