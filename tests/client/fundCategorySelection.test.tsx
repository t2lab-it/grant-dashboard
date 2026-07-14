import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFundCategorySelection } from "../../src/features/funds/fundDetailDialogSupport";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe("useFundCategorySelection", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("carries the exact category code across funds and follows the latest manual choice", async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (url === "/api/overview?year=2026") return { ok: true, json: async () => ({ funds: [{ id: 1, name: "A" }, { id: 2, name: "B" }, { id: 3, name: "C" }] }) };
      if (url === "/api/funds/1") return { ok: true, json: async () => ({ categories: [{ id: 1, categoryCode: "Travel", categoryName: "旅費" }] }) };
      if (url === "/api/funds/2") return { ok: true, json: async () => ({ categories: [{ id: 2, categoryCode: "Travel", categoryName: "別名" }, { id: 3, categoryCode: "OTHER", categoryName: "旅費" }] }) };
      if (url === "/api/funds/3") return { ok: true, json: async () => ({ categories: [{ id: 4, categoryCode: "OTHER", categoryName: "消耗品" }, { id: 5, categoryCode: "travel", categoryName: "旅費" }] }) };
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const { result } = renderHook(() => useFundCategorySelection({ initialFundId: 1, initialCategoryId: 1, initialCategoryCode: "Travel", fiscalYear: 2026, enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.areCategoriesLoaded).toBe(true));
    act(() => result.current.onFundChange("2"));
    expect(result.current.selectedCategoryId).toBe("");
    await waitFor(() => expect(result.current.selectedCategoryId).toBe("2"));
    act(() => result.current.onCategoryChange("3"));
    act(() => result.current.onFundChange("3"));
    await waitFor(() => expect(result.current.selectedCategoryId).toBe("4"));
  });

  it("does not fetch or adjust selection when disabled", async () => {
    const { result } = renderHook(() => useFundCategorySelection({ initialFundId: 1, initialCategoryId: 1, initialCategoryCode: "code", fiscalYear: 2026, enabled: false }), { wrapper });
    expect(result.current.selectedCategoryId).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
