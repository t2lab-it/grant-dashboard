import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchMock, renderAppRoute, resetOverviewTestState } from "./overviewTestUtils";
import { storedAppSettings } from "./testUtils";

describe("Fund detail display", () => {
  beforeEach(() => {
    resetOverviewTestState();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders budget consumption rate details through the app route", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        fund: { id: 1, name: "基盤研究費", fiscalYear: 2026, awarded_amount: 5080000 },
        categories: [
          {
            id: 1,
            categoryName: "しきい値70",
            crossAggregateCategory: "other",
            budgetAmount: 1000000,
            plannedAmount: 700000,
            actualAmount: 0,
          },
          {
            id: 2,
            categoryName: "しきい値90",
            crossAggregateCategory: "other",
            budgetAmount: 1000000,
            plannedAmount: 900000,
            actualAmount: 0,
          },
          {
            id: 3,
            categoryName: "物品費",
            crossAggregateCategory: "equipment",
            budgetAmount: 1000000,
            plannedAmount: 1000000,
            actualAmount: 500000,
          },
          {
            id: 4,
            categoryName: "消耗品費",
            crossAggregateCategory: "unset",
            budgetAmount: null,
            plannedAmount: 0,
            actualAmount: 58336,
          },
        ],
        crossAggregateCategories: [
          {
            crossAggregateCategory: "equipment",
            budgetAmount: 1000000,
            plannedAmount: 1000000,
            actualAmount: 500000,
          },
          {
            crossAggregateCategory: "unset",
            budgetAmount: null,
            plannedAmount: 0,
            actualAmount: 58336,
          },
        ],
        monthlyStatus: [
          { month: "2026-04", plannedAmount: 0, actualAmount: 5000, totalAmount: 5000 },
          { month: "2026-06", plannedAmount: 2000000, actualAmount: 300000, totalAmount: 2300000 },
        ],
        actualEntries: [
          {
            id: 8,
            actualDate: "2026-06-20",
            categoryName: "物品費",
            description: "GPU サーバ保守",
            amount: 300000,
            notes: "保守契約の更新費用",
            auxiliaryLabels: [{ id: 5, kind: "auxiliary", name: "要確認", color: "#7c3aed" }],
          },
          {
            id: 7,
            actualDate: "2026-04-01",
            categoryName: "消耗品費",
            description: "研究ノート",
            amount: 5000,
            notes: "",
          },
        ],
        plannedItems: [
          {
            id: 10,
            plannedDate: "2026-07-10",
            scheduledMonth: "2026-07",
            categoryName: "物品費",
            description: "GPU サーバ保守更新",
            amount: 280000,
            notes: "未精算",
            auxiliaryLabels: [{ id: 4, kind: "auxiliary", name: "出張", color: "#f59e0b" }],
          },
          {
            id: 9,
            plannedDate: "2026-05-01",
            scheduledMonth: "2026-05",
            categoryName: "消耗品費",
            description: "試薬購入",
            amount: 50000,
            notes: "",
          },
        ],
        plannedItemHistory: [
          {
            id: 12,
            plannedDate: "2026-06-01",
            scheduledMonth: "2026-06",
            categoryName: "旅費",
            description: "取消済み研究会",
            amount: 80000,
            notes: "日程変更で取消",
          },
        ],
      }),
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);

    expect(await fundPage.findByRole("heading", { name: "基盤研究費" }, { timeout: 5_000 })).toBeInTheDocument();
    const summary = await fundPage.findByRole("region", { name: "Fund summary" });
    const summaryScope = within(summary);
    const categoryTable = fundPage.getByRole("table", { name: "Fund categories" });
    const categoryScope = within(categoryTable);
    const categoryPanel = fundPage.getByRole("heading", { name: "費目別の状況" }).closest(".detail-panel");
    const exportLink = fundPage.getByRole("link", { name: "収支簿出力" });

    expect(summaryScope.getByText("残高")).toBeInTheDocument();
    expect(summaryScope.getByText("交付額")).toBeInTheDocument();
    expect(summaryScope.getByText("執行予定額")).toBeInTheDocument();
    expect(summaryScope.getByText("執行済額")).toBeInTheDocument();
    expect(categoryPanel).not.toBeNull();
    expect(exportLink).toHaveAttribute("href", "/api/exports/ledger.xlsx?year=2026&fundId=1");
    const rateToggleScope = within(fundPage.getByRole("group", { name: "率表示" }));
    expect(rateToggleScope.getByRole("button", { name: "予算消化率" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(rateToggleScope.getByRole("button", { name: "残高率" })).toHaveAttribute("aria-pressed", "false");
    expect(categoryScope.getByText("執行予定額")).toBeInTheDocument();
    expect(categoryScope.getByText("執行済額")).toBeInTheDocument();
    expect(categoryScope.getByText("予算消化率")).toBeInTheDocument();
    expect(fundPage.getByText("150.0%")).toHaveClass("detail-rate-alert");
    expect(categoryScope.getByText("2,600,000円")).toBeInTheDocument();
    expect(categoryScope.getByText("558,336円")).toBeInTheDocument();
    const chart = fundPage.getByLabelText("基盤研究費 の費目別執行内訳");
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAttribute("aria-describedby");
    expect(within(chart).getByText("62.2%")).toBeInTheDocument();
    const chartSummary = document.getElementById(chart.getAttribute("aria-describedby") ?? "");
    expect(chartSummary).not.toBeNull();
    expect(chartSummary).toHaveTextContent("執行予定 2,600,000円");
    expect(chartSummary).toHaveTextContent("執行済 558,336円");
    expect(chartSummary).toHaveTextContent("残高 1,921,664円");

    await user.click(rateToggleScope.getByRole("button", { name: "残高率" }));

    expect(rateToggleScope.getByRole("button", { name: "予算消化率" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(rateToggleScope.getByRole("button", { name: "残高率" })).toHaveAttribute("aria-pressed", "true");

    const timelineSection = fundPage.getByRole("heading", { name: "月別の状況" }).closest(".detail-panel");
    expect(timelineSection).not.toBeNull();
    const timelineScope = within(timelineSection as HTMLElement);
    expect(fundPage.queryByRole("table", { name: "Cross aggregate categories" })).not.toBeInTheDocument();
    await user.click(fundPage.getByRole("button", { name: "横断集計カテゴリ別の状況" }));
    const crossAggregateTable = fundPage.getByRole("table", { name: "Cross aggregate categories" });
    const crossAggregateScope = within(crossAggregateTable);
    expect(crossAggregateScope.getByText("横断集計カテゴリ")).toBeInTheDocument();
    expect(crossAggregateScope.getByText("物品系")).toBeInTheDocument();
    expect(crossAggregateScope.getAllByText("未設定").length).toBeGreaterThanOrEqual(1);
    expect(crossAggregateScope.getByText("-500,000円")).toBeInTheDocument();
    expect(crossAggregateScope.getByText("-58,336円")).toBeInTheDocument();
    expect(categoryScope.getByText("残高率")).toBeInTheDocument();
    expect(categoryScope.getByText("-50.0%")).toHaveClass("detail-rate-alert");

    expect(timelineScope.getByText("執行予定額")).toBeInTheDocument();
    expect(timelineScope.getByText("執行済額")).toBeInTheDocument();
    expect(timelineScope.getByText("執行予定額+執行済額")).toBeInTheDocument();
    expect(timelineScope.getByText("2026-04")).toBeInTheDocument();
    expect(fundPage.getByRole("heading", { name: "精算項目一覧" })).toBeInTheDocument();
    const historyTable = fundPage.getByRole("table", { name: "Fund actual entries" });
    const historyScope = within(historyTable);

    expect(historyScope.getByText("GPU サーバ保守")).toBeInTheDocument();
    expect(historyScope.getByText("要確認")).toBeInTheDocument();
    expect(historyScope.getByText("研究ノート")).toBeInTheDocument();
    expect(historyScope.getByText("300,000円")).toBeInTheDocument();
    expect(historyScope.getByText("5,000円")).toBeInTheDocument();
    const actualHistorySection = fundPage.getByRole("heading", { name: "精算項目一覧" }).closest(".detail-panel");
    expect(actualHistorySection).not.toBeNull();
    expect(fundPage.getByRole("heading", { name: "計画項目一覧" })).toBeInTheDocument();
    const plannedTable = fundPage.getByRole("table", { name: "Fund planned items" });
    const plannedScope = within(plannedTable);
    const plannedSection = fundPage.getByRole("heading", { name: "計画項目一覧" }).closest(".detail-panel");
    expect(plannedSection).not.toBeNull();

    expect(within(plannedSection as HTMLElement).getByRole("link", { name: "計画作成" })).toHaveAttribute(
      "href",
      "/planned-items/new?fundId=1&year=2026",
    );
    expect(plannedScope.getByText("2026-07")).toBeInTheDocument();
    expect(plannedScope.queryByText("2026-07-10")).not.toBeInTheDocument();
    expect(plannedScope.getByText("GPU サーバ保守更新")).toBeInTheDocument();
    expect(plannedScope.getByText("出張")).toBeInTheDocument();
    expect(plannedScope.getByText("280,000円")).toBeInTheDocument();
    expect(fundPage.getByRole("heading", { name: "取消済項目一覧" })).toBeInTheDocument();
    const plannedHistoryTable = fundPage.getByRole("table", { name: "Fund planned item history" });
    const plannedHistoryScope = within(plannedHistoryTable);
    expect(plannedHistoryScope.getByText("2026-06")).toBeInTheDocument();
    expect(plannedHistoryScope.getByText("取消済み研究会")).toBeInTheDocument();
    expect(plannedHistoryScope.getByText("80,000円")).toBeInTheDocument();
    expect(plannedHistoryScope.getByRole("button", { name: "再計画" })).toBeInTheDocument();
    expect(plannedHistoryScope.getByRole("button", { name: "削除" })).toHaveClass("detail-action-button-danger");
  }, 10_000);

  it("renders planned item creation as a full page when opened directly", async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;

      if (url === "/api/overview") {
        return {
          ok: true,
          json: async () => ({
            funds: [{ id: 1, name: "基盤研究費" }],
          }),
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAppRoute("/planned-items/new");

    expect(await screen.findByRole("heading", { name: "予定作成" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "閉じる" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "予定作成" })).not.toBeInTheDocument();
  });

  it("renders fund detail amounts in rounded thousand-yen units when the saved amount display mode is thousand-yen", async () => {
    window.localStorage.setItem(
      "budget-dashboard:settings",
      storedAppSettings({
        amountDisplayMode: "thousand-yen",
      }),
    );

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
        categories: [
          {
            id: 1,
            categoryName: "物品費",
            budgetAmount: 1000000,
            plannedAmount: 1000000,
            actualAmount: 500000,
          },
          {
            id: 2,
            categoryName: "消耗品費",
            budgetAmount: 200000,
            plannedAmount: 0,
            actualAmount: 58336,
          },
          {
            id: 3,
            categoryName: "しきい値50",
            budgetAmount: 1000000,
            plannedAmount: 500000,
            actualAmount: 0,
          },
          {
            id: 4,
            categoryName: "しきい値80",
            budgetAmount: 1000000,
            plannedAmount: 800000,
            actualAmount: 0,
          },
        ],
        monthlyStatus: [],
        actualEntries: [],
        plannedItems: [],
      }),
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);

    expect(await fundPage.findByRole("heading", { name: "基盤研究費" })).toBeInTheDocument();
    const summary = await fundPage.findByRole("region", { name: "Fund summary" });
    const summaryScope = within(summary);
    expect(summaryScope.getByText("2222千円")).toBeInTheDocument();
    expect(summaryScope.getByText("5080千円")).toBeInTheDocument();
    expect(summaryScope.getByText("2300千円")).toBeInTheDocument();

    const chart = fundPage.getByLabelText("基盤研究費 の費目別執行内訳");
    const chartSummary = document.getElementById(chart.getAttribute("aria-describedby") ?? "");
    expect(chartSummary).not.toBeNull();
    expect(chartSummary).toHaveTextContent("執行予定 2300千円");
    expect(chartSummary).toHaveTextContent("執行済 558千円");
    expect(chartSummary).toHaveTextContent("残高 2222千円");
    expect(chartSummary).toHaveTextContent("消耗品費 執行済 58千円");
  });

  it("shows an over-budget ring and warning center label when the balance is negative", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        fund: { id: 1, name: "基盤研究費", awarded_amount: 1000000 },
        categories: [
          {
            id: 1,
            categoryName: "物品費",
            budgetAmount: 1000000,
            plannedAmount: 700000,
            actualAmount: 400000,
          },
        ],
        monthlyStatus: [],
        actualEntries: [],
        plannedItems: [],
      }),
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);

    expect(await fundPage.findByRole("heading", { name: "基盤研究費" })).toBeInTheDocument();
    const chart = fundPage.getByLabelText("基盤研究費 の費目別執行内訳");
    expect(within(chart).getByText("超過")).toHaveClass("detail-rate-alert");
    expect(within(chart).getByText("-100,000円")).toHaveClass("detail-rate-alert");
    expect(chart.querySelector(".fund-card-over-budget-ring")).not.toBeNull();
  });

  it("renders an explicit error when the fund id route param is invalid", async () => {
    renderAppRoute("/funds/not-a-number");

    expect(screen.getByText("Fund id is invalid.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/overview", {});
  });
});
