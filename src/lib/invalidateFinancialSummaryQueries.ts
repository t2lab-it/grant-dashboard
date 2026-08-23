import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

export async function invalidateFinancialSummaryQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.overview.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.fiscalYearComparison.all }),
  ]);
}
