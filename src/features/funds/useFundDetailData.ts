import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import type { FundDetailResponse } from "./fundDetailTypes";

export function useFundDetailData(fundId: number) {
  const queryClient = useQueryClient();
  const hasValidFundId = Number.isInteger(fundId) && fundId > 0;
  const query = useQuery({
    queryKey: ["fund", fundId],
    queryFn: () => apiGet<FundDetailResponse>(`/api/funds/${fundId}`),
    enabled: hasValidFundId,
  });

  async function refreshFundDetail() {
    await queryClient.invalidateQueries({ queryKey: ["fund", fundId] });
  }

  async function refreshFundDetailAndOverview() {
    await Promise.all([
      refreshFundDetail(),
      queryClient.invalidateQueries({ queryKey: ["overview"] }),
    ]);
  }

  return {
    ...query,
    refreshFundDetail,
    refreshFundDetailAndOverview,
  };
}
