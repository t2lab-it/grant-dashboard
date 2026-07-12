import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fetchMock, renderAppRoute, resetOverviewTestState, setupFundDetailTests } from "./fundDetailTestUtils";

describe("Fund detail interactions", () => {
  setupFundDetailTests();

  it("opens actual entry creation from the fund detail page as a modal while keeping the fund page visible", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
        categories: [],
        monthlyStatus: [],
        actualEntries: [],
        plannedItems: [],
      }),
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);

    expect(await fundPage.findByRole("heading", { name: "精算項目一覧" })).toBeInTheDocument();
    const actualHistorySection = fundPage.getByRole("heading", { name: "精算項目一覧" }).closest(".detail-panel");
    expect(actualHistorySection).not.toBeNull();

    await user.click(within(actualHistorySection as HTMLElement).getByRole("link", { name: "実績作成" }));

    const dialog = await screen.findByRole("dialog", { name: "実績作成" });
    expect(await within(dialog).findByRole("button", { name: "閉じる" })).toBeInTheDocument();
    expect(fundPage.getByRole("heading", { name: "精算項目一覧" })).toBeInTheDocument();
  });

  it("marks planned and actual rows referenced by the focus query", async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url === "/api/funds/1" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            fund: { id: 1, name: "基盤研究費", fiscalYear: 2026, awarded_amount: 5080000, notes: "" },
            categories: [
              {
                id: 1,
                categoryName: "物品費",
                budgetAmount: 500000,
                plannedAmount: 280000,
                actualAmount: 300000,
              },
            ],
            monthlyStatus: [],
            actualEntries: [
              {
                id: 8,
                actualDate: "2026-06-20",
                categoryName: "物品費",
                description: "GPU サーバ保守",
                amount: 300000,
                notes: "",
              },
            ],
            plannedItems: [
              {
                id: 10,
                plannedDate: "2026-07-10",
                scheduledMonth: "2026-07",
                categoryId: 1,
                categoryName: "物品費",
                description: "GPU サーバ保守更新",
                amount: 280000,
                notes: "",
              },
            ],
          }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const plannedView = renderAppRoute("/funds/1?year=2026&focus=planned-10");
    await within(plannedView.container).findByText("GPU サーバ保守更新");
    expect(plannedView.container.querySelector("#planned-item-10")).toHaveAttribute("data-search-focus", "true");

    cleanup();
    resetOverviewTestState();
    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url === "/api/funds/1" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            fund: { id: 1, name: "基盤研究費", fiscalYear: 2026, awarded_amount: 5080000, notes: "" },
            categories: [],
            monthlyStatus: [],
            actualEntries: [
              {
                id: 8,
                actualDate: "2026-06-20",
                categoryName: "物品費",
                description: "GPU サーバ保守",
                amount: 300000,
                notes: "",
              },
            ],
            plannedItems: [],
          }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const actualView = renderAppRoute("/funds/1?year=2026&focus=actual-8");
    await within(actualView.container).findByText("GPU サーバ保守");
    expect(actualView.container.querySelector("#actual-entry-8")).toHaveAttribute("data-search-focus", "true");
  });
});
