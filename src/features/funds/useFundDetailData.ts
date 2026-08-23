import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import type { FundDetailResponse } from "./fundDetailTypes";

export function useFundDetailData(fundId: number) {
  const queryClient = useQueryClient();
  const hasValidFundId = Number.isInteger(fundId) && fundId > 0;
  const query = useQuery({
    queryKey: queryKeys.fund.detail(fundId),
    queryFn: () => apiGet<FundDetailResponse>(`/api/funds/${fundId}`),
    enabled: hasValidFundId,
  });

  async function refreshFundDetail() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.fund.detail(fundId) });
  }

  async function refreshFundDetailAndOverview() {
    await Promise.all([
      refreshFundDetail(),
      queryClient.invalidateQueries({ queryKey: queryKeys.overview.all }),
    ]);
  }

  async function clearDeletedFund() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.overview.all });
    queryClient.removeQueries({ queryKey: queryKeys.fund.detail(fundId), exact: true });
  }

  return {
    ...query,
    clearDeletedFund,
    refreshFundDetail,
    refreshFundDetailAndOverview,
  };
}
