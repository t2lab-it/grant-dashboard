import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";

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

export function useCloseOnEscape(onClose: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, onClose]);
}

export function useBudgetTargetOptions(selectedFundId: string, enabled: boolean) {
  const parsedFundId = selectedFundId.trim().length > 0 ? Number(selectedFundId) : Number.NaN;
  const hasSelectedFund = Number.isInteger(parsedFundId) && parsedFundId > 0;
  const { data: overviewData } = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/overview"),
    enabled,
  });
  const { data: fundDetailData } = useQuery({
    queryKey: ["fund-category-options", parsedFundId],
    queryFn: () => apiGet<FundCategoryOptionsResponse>(`/api/funds/${parsedFundId}`),
    enabled: enabled && hasSelectedFund,
  });

  return {
    funds: overviewData?.funds ?? [],
    categories: fundDetailData?.categories ?? [],
    hasSelectedFund,
  };
}
