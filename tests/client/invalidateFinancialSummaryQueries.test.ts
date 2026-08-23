import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import { invalidateFinancialSummaryQueries } from "../../src/lib/invalidateFinancialSummaryQueries";
import { queryKeys } from "../../src/lib/queryKeys";

describe("invalidateFinancialSummaryQueries", () => {
  test("invalidates annual overview and all-year comparison without touching unrelated data", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.overview.detail(2026), { selectedFiscalYear: 2026 });
    queryClient.setQueryData(queryKeys.fiscalYearComparison.all, { fiscalYears: [] });
    queryClient.setQueryData(queryKeys.fund.detail(1), { fund: { id: 1 } });

    await invalidateFinancialSummaryQueries(queryClient);

    expect(queryClient.getQueryState(queryKeys.overview.detail(2026))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(queryKeys.fiscalYearComparison.all)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(queryKeys.fund.detail(1))?.isInvalidated).toBe(false);
  });
});
