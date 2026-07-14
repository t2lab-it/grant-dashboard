import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
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
    categoryCode: string;
    categoryName: string;
  }>;
};

export type UseFundCategorySelectionOptions = {
  initialFundId: number;
  initialCategoryId: number;
  initialCategoryCode: string;
  fiscalYear: number;
  enabled: boolean;
};

export function useFundCategorySelection(options: UseFundCategorySelectionOptions) {
  const [selectedFundId, setSelectedFundId] = useState(String(options.initialFundId));
  const [selectedCategoryId, setSelectedCategoryId] = useState(String(options.initialCategoryId));
  const categoryCodeRef = useRef(options.initialCategoryCode);
  const { funds, categories, hasSelectedFund, areCategoriesLoaded } = useBudgetTargetOptions(
    selectedFundId,
    options.fiscalYear,
    options.enabled,
  );

  useEffect(() => {
    if (!options.enabled || !areCategoriesLoaded || selectedCategoryId.length > 0) {
      return;
    }
    const match = categories.find((category) => category.categoryCode === categoryCodeRef.current);
    if (match !== undefined) {
      setSelectedCategoryId(String(match.id));
    }
  }, [areCategoriesLoaded, categories, options.enabled, selectedCategoryId]);

  function onFundChange(value: string) {
    setSelectedFundId(value);
    setSelectedCategoryId("");
  }

  function onCategoryChange(value: string) {
    setSelectedCategoryId(value);
    const category = categories.find((candidate) => String(candidate.id) === value);
    if (category !== undefined) {
      categoryCodeRef.current = category.categoryCode;
    }
  }

  return {
    selectedFundId,
    selectedCategoryId,
    funds,
    categories,
    hasSelectedFund,
    areCategoriesLoaded,
    onFundChange,
    onCategoryChange,
  };
}

export function useBudgetTargetOptions(selectedFundId: string, fiscalYear: number, enabled: boolean) {
  const parsedFundId = selectedFundId.trim().length > 0 ? Number(selectedFundId) : Number.NaN;
  const hasSelectedFund = Number.isInteger(parsedFundId) && parsedFundId > 0;
  const { data: overviewData } = useQuery({
    queryKey: queryKeys.overview.detail(fiscalYear),
    queryFn: () => apiGet<OverviewResponse>(buildOverviewApiPath(fiscalYear)),
    enabled,
  });
  const categoryOptionsQuery = useQuery({
    queryKey: queryKeys.fund.categoryOptions(parsedFundId),
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
