import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fetchMock, renderAppRoute, setupFundDetailTests, setHoverCapablePointer } from "./fundDetailTestUtils";
import { storedAppSettings } from "./testUtils";

describe("Fund detail interactions", () => {
  setupFundDetailTests();

  it("opens a fund edit modal from the category section and saves updated fund details", async () => {
    const user = userEvent.setup();
    let currentFundDetail = {
      fund: {
        id: 1,
        name: "基盤研究費",
        fiscalYear: 2026,
        awarded_amount: 5080000,
        notes: "初期メモ",
      },
      categories: [
        {
          id: 1,
          categoryName: "物品費",
          crossAggregateCategory: "equipment",
          budgetAmount: 1000000,
          plannedAmount: 500000,
          actualAmount: 250000,
        },
      ],
      crossAggregateCategories: [
        {
          crossAggregateCategory: "equipment",
          budgetAmount: 1000000,
          plannedAmount: 500000,
          actualAmount: 250000,
        },
      ],
      monthlyStatus: [],
      actualEntries: [],
      plannedItems: [],
    };

    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url === "/api/funds/1" && method === "GET") {
        return {
          ok: true,
          json: async () => currentFundDetail,
        };
      }

      if (url === "/api/funds/1" && method === "PUT") {
        const payload = JSON.parse(String(init?.body)) as {
          name: string;
          fiscalYear: number;
          awardedAmount: number;
          notes: string;
          categories: Array<{
            id?: number;
            name: string;
            amount: number;
            crossAggregateCategory: "equipment" | "other" | "travel" | "personnel" | "unset";
          }>;
        };
        currentFundDetail = {
          ...currentFundDetail,
          fund: {
            ...currentFundDetail.fund,
            name: payload.name,
            fiscalYear: payload.fiscalYear,
            awarded_amount: payload.awardedAmount,
            notes: payload.notes,
          },
          categories: payload.categories.map((category, index) => ({
            id: category.id ?? index + 1,
            categoryName: category.name,
            crossAggregateCategory: category.crossAggregateCategory,
            budgetAmount: category.amount,
            plannedAmount: 0,
            actualAmount: 0,
          })),
          crossAggregateCategories: payload.categories.map((category) => ({
            crossAggregateCategory: category.crossAggregateCategory,
            budgetAmount: category.amount,
            plannedAmount: 0,
            actualAmount: 0,
          })),
        };

        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const categoryPanel = (
      await fundPage.findByRole("heading", { name: "費目別の状況" }, { timeout: 5_000 })
    ).closest(".detail-panel");

    expect(categoryPanel).not.toBeNull();

    await user.click(within(categoryPanel as HTMLElement).getByRole("button", { name: "予算を編集" }));

    const dialog = await screen.findByRole("dialog", { name: "予算を編集" });
    expect(within(dialog).getByRole("button", { name: "削除" })).toHaveClass(
      "detail-action-button-danger",
    );
    expect(within(dialog).getByLabelText("予算名")).toHaveValue("基盤研究費");
    expect(within(dialog).getByLabelText("年度")).toHaveValue(2026);
    expect(within(dialog).getByLabelText("交付額")).toHaveValue("5080000");
    expect(within(dialog).getByLabelText("予算メモ")).toHaveValue("初期メモ");
    expect(within(dialog).getAllByLabelText("費目名")).toHaveLength(1);
    expect(within(dialog).getByLabelText("横断集計カテゴリ")).toHaveValue("equipment");
    const categoryChart = within(dialog).getByRole("region", { name: "横断カテゴリ別の予算配分" });
    expect(categoryChart).toHaveTextContent("物品系");
    expect(categoryChart).toHaveTextContent("1,000,000円");
    expect(categoryChart).toHaveTextContent("差額");
    expect(categoryChart).toHaveTextContent("4,080,000円");

    await user.clear(within(dialog).getByLabelText("予算名"));
    await user.type(within(dialog).getByLabelText("予算名"), "基盤研究費 改");
    await user.clear(within(dialog).getByLabelText("年度"));
    await user.type(within(dialog).getByLabelText("年度"), "2027");
    await user.clear(within(dialog).getByLabelText("交付額"));
    await user.type(within(dialog).getByLabelText("交付額"), "900000");
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "保存" })).toHaveClass("budget-entry-submit-disabled");
    expect(within(dialog).getByText("費目予算の合計が交付額を超えています。")).toBeInTheDocument();
    expect(categoryChart.querySelector(".budget-category-over-budget-ring")).not.toBeNull();
    await user.clear(within(dialog).getByLabelText("交付額"));
    await user.type(within(dialog).getByLabelText("交付額"), "6,000,000 + 100,000");
    expect(within(dialog).queryByText("費目予算の合計が交付額を超えています。")).not.toBeInTheDocument();
    expect(categoryChart.querySelector(".budget-category-over-budget-ring")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "保存" })).not.toHaveClass("budget-entry-submit-disabled");
    await user.clear(within(dialog).getByLabelText("予算メモ"));
    await user.type(within(dialog).getByLabelText("予算メモ"), "更新メモ");
    await user.clear(within(dialog).getByLabelText("費目名"));
    await user.type(within(dialog).getByLabelText("費目名"), "設備費");
    fireEvent.change(within(dialog).getByLabelText("横断集計カテゴリ"), { target: { value: "equipment" } });
    await user.clear(within(dialog).getByLabelText("予算額"));
    await user.type(within(dialog).getByLabelText("予算額"), "1400000");
    await user.click(within(dialog).getByRole("button", { name: "費目を追加" }));
    await user.type(within(dialog).getAllByLabelText("費目名")[1], "外注費");
    fireEvent.change(within(dialog).getAllByLabelText("横断集計カテゴリ")[1], { target: { value: "other" } });
    await user.type(within(dialog).getAllByLabelText("予算額")[1], "250000");
    expect(categoryChart).toHaveTextContent("その他");
    expect(categoryChart).toHaveTextContent("250,000円");
    expect(categoryChart).toHaveTextContent("4,450,000円");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/funds/1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "基盤研究費 改",
        fiscalYear: 2027,
        awardedAmount: 6100000,
        notes: "更新メモ",
        projectTagIds: [],
        auxiliaryLabelIds: [],
        categories: [
          { id: 1, name: "設備費", amount: 1400000, crossAggregateCategory: "equipment" },
          { name: "外注費", amount: 250000, crossAggregateCategory: "other" },
        ],
      }),
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "予算を編集" })).not.toBeInTheDocument();
    });
    expect(await fundPage.findByRole("heading", { name: "基盤研究費 改" })).toBeInTheDocument();
    expect(within(fundPage.getByRole("region", { name: "予算概要" })).getAllByText("6,100,000円")).toHaveLength(2);
    const categoryTable = fundPage.getByRole("table", { name: "費目別の状況" });
    expect(within(categoryTable).getByText("設備費")).toBeInTheDocument();
    expect(within(categoryTable).getByText("外注費")).toBeInTheDocument();
  }, 10_000);

  it("applies the list-wide search text and category filters to actual, planned, and cancelled lists", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
        categories: [
          {
            id: 1,
            categoryName: "物品費",
            budgetAmount: 500000,
            plannedAmount: 280000,
            actualAmount: 300000,
          },
          {
            id: 2,
            categoryName: "旅費",
            budgetAmount: 400000,
            plannedAmount: 180000,
            actualAmount: 120000,
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
          {
            id: 7,
            actualDate: "2026-06-25",
            categoryName: "旅費",
            description: "学会出張 精算",
            amount: 120000,
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
          {
            id: 11,
            plannedDate: "2026-08-01",
            scheduledMonth: "2026-08",
            categoryId: 2,
            categoryName: "旅費",
            description: "学会出張 予定",
            amount: 180000,
            notes: "",
          },
        ],
        plannedItemHistory: [
          {
            id: 12,
            plannedDate: "2026-09-01",
            scheduledMonth: "2026-09",
            categoryId: 1,
            categoryName: "物品費",
            description: "取消済み GPU サーバ",
            amount: 160000,
            notes: "",
          },
          {
            id: 13,
            plannedDate: "2026-10-01",
            scheduledMonth: "2026-10",
            categoryId: 2,
            categoryName: "旅費",
            description: "取消済み 学会出張",
            amount: 90000,
            notes: "",
          },
        ],
      }),
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const actualSection = (await fundPage.findByRole("heading", { name: "精算項目一覧" })).closest(".detail-panel");
    const plannedSection = fundPage.getByRole("heading", { name: "計画項目一覧" }).closest(".detail-panel");
    const plannedHistorySection = fundPage.getByRole("heading", { name: "完了・取消済項目一覧" }).closest(".detail-panel");

    expect(actualSection).not.toBeNull();
    expect(plannedSection).not.toBeNull();
    expect(plannedHistorySection).not.toBeNull();

    const actualScope = within(actualSection as HTMLElement);
    const plannedScope = within(plannedSection as HTMLElement);
    const plannedHistoryScope = within(plannedHistorySection as HTMLElement);
    const filterPanel = fundPage.getByRole("group", { name: "一覧全体の絞り込み" });

    expect(filterPanel.closest(".detail-panel")).toBeNull();
    expect(filterPanel.closest(".detail-list-filter-bar")).not.toBeNull();
    expect(fundPage.queryByRole("heading", { name: "一覧全体の絞り込み" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "検索" })).toHaveLength(1);
    expect(screen.getAllByRole("combobox", { name: "費目" })).toHaveLength(1);
    expect(actualScope.queryByRole("textbox", { name: "検索" })).not.toBeInTheDocument();
    expect(plannedScope.queryByRole("textbox", { name: "検索" })).not.toBeInTheDocument();
    expect(plannedHistoryScope.queryByRole("textbox", { name: "検索" })).not.toBeInTheDocument();

    await user.type(within(filterPanel).getByRole("textbox", { name: "検索" }), "出張");

    expect(actualScope.queryByText("GPU サーバ保守")).not.toBeInTheDocument();
    expect(plannedScope.queryByText("GPU サーバ保守更新")).not.toBeInTheDocument();
    expect(plannedScope.getByText("学会出張 予定")).toBeInTheDocument();
    expect(plannedHistoryScope.queryByText("取消済み GPU サーバ")).not.toBeInTheDocument();
    expect(plannedHistoryScope.getByText("取消済み 学会出張")).toBeInTheDocument();

    await user.selectOptions(within(filterPanel).getByRole("combobox", { name: "費目" }), "物品費");

    expect(screen.getAllByText("条件に一致する項目はありません。")).toHaveLength(3);
    expect(fundPage.getByRole("heading", { name: "完了・取消済項目一覧" })).toBeInTheDocument();
  });

  it("sorts monthly status, actual entries, and planned items from section controls", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
        categories: [
          {
            id: 1,
            categoryName: "物品費",
            budgetAmount: 500000,
            plannedAmount: 280000,
            actualAmount: 300000,
          },
        ],
        monthlyStatus: [
          { month: "2026-04", plannedAmount: 0, actualAmount: 5000, totalAmount: 5000 },
          { month: "2026-08", plannedAmount: 180000, actualAmount: 10000, totalAmount: 190000 },
          { month: "2026-06", plannedAmount: 200000, actualAmount: 300000, totalAmount: 500000 },
        ],
        actualEntries: [
          {
            id: 8,
            actualDate: "2026-06-20",
            categoryName: "物品費",
            description: "GPU サーバ保守",
            amount: 300000,
            notes: "",
          },
          {
            id: 7,
            actualDate: "2026-06-25",
            categoryName: "物品費",
            description: "学会出張 精算",
            amount: 120000,
            notes: "",
          },
          {
            id: 6,
            actualDate: "2026-05-01",
            categoryName: "物品費",
            description: "試薬購入",
            amount: 500000,
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
          {
            id: 11,
            plannedDate: "2026-08-01",
            scheduledMonth: "2026-08",
            categoryId: 1,
            categoryName: "物品費",
            description: "学会出張 予定",
            amount: 180000,
            notes: "",
          },
          {
            id: 12,
            plannedDate: "2026-05-15",
            scheduledMonth: "2026-05",
            categoryId: 1,
            categoryName: "物品費",
            description: "試薬補充",
            amount: 500000,
            notes: "",
          },
        ],
      }),
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const timelineSection = (await fundPage.findByRole("heading", { name: "月別の状況" })).closest(".detail-panel");
    const actualSection = fundPage.getByRole("heading", { name: "精算項目一覧" }).closest(".detail-panel");
    const plannedSection = fundPage.getByRole("heading", { name: "計画項目一覧" }).closest(".detail-panel");

    expect(timelineSection).not.toBeNull();
    expect(actualSection).not.toBeNull();
    expect(plannedSection).not.toBeNull();

    const getTimelineMonths = () =>
      Array.from((timelineSection as HTMLElement).querySelectorAll(".timeline-row strong")).map((element) => element.textContent);
    const getActualDescriptions = () =>
      Array.from((actualSection as HTMLElement).querySelectorAll(".detail-actual-row")).map(
        (row) => row.children[2]?.textContent,
      );
    const getPlannedDescriptions = () =>
      Array.from((plannedSection as HTMLElement).querySelectorAll(".detail-planned-row")).map(
        (row) => row.children[2]?.textContent,
      );

    expect(fundPage.queryByRole("combobox", { name: "月別の状況の並び順" })).not.toBeInTheDocument();
    expect(within(actualSection as HTMLElement).queryByRole("combobox", { name: "並び順" })).not.toBeInTheDocument();
    expect(within(plannedSection as HTMLElement).queryByRole("combobox", { name: "並び順" })).not.toBeInTheDocument();
    expect(within(timelineSection as HTMLElement).getByRole("button", { name: "月" })).toBeInTheDocument();
    expect(within(timelineSection as HTMLElement).getByRole("button", { name: "執行予定額" })).toBeInTheDocument();
    expect(within(timelineSection as HTMLElement).getByRole("button", { name: "執行済額" })).toBeInTheDocument();
    expect(within(timelineSection as HTMLElement).getByRole("button", { name: "執行予定額+執行済額" })).toBeInTheDocument();
    expect(within(actualSection as HTMLElement).getByRole("button", { name: "日付" })).toBeInTheDocument();
    expect(within(actualSection as HTMLElement).getByRole("button", { name: "費目" })).toBeInTheDocument();
    expect(within(actualSection as HTMLElement).getByRole("button", { name: "内容" })).toBeInTheDocument();
    expect(within(actualSection as HTMLElement).getByRole("button", { name: "金額" })).toBeInTheDocument();
    expect(within(plannedSection as HTMLElement).getByRole("button", { name: "執行予定月" })).toBeInTheDocument();
    expect(within(plannedSection as HTMLElement).getByRole("button", { name: "費目" })).toBeInTheDocument();
    expect(within(plannedSection as HTMLElement).getByRole("button", { name: "内容" })).toBeInTheDocument();
    expect(within(plannedSection as HTMLElement).getByRole("button", { name: "金額" })).toBeInTheDocument();
    expect(getTimelineMonths()).toEqual(["2026-04", "2026-06", "2026-08"]);
    expect(getActualDescriptions()).toEqual(["試薬購入", "GPU サーバ保守", "学会出張 精算"]);
    expect(getPlannedDescriptions()).toEqual(["試薬補充", "GPU サーバ保守更新", "学会出張 予定"]);

    await user.click(within(timelineSection as HTMLElement).getByRole("button", { name: "月" }));
    await user.click(within(actualSection as HTMLElement).getByRole("button", { name: "金額" }));
    await user.click(within(plannedSection as HTMLElement).getByRole("button", { name: "金額" }));

    expect(getTimelineMonths()).toEqual(["2026-08", "2026-06", "2026-04"]);
    expect(within(timelineSection as HTMLElement).getByRole("button", { name: "月" })).toHaveTextContent("▼");
    expect(within(actualSection as HTMLElement).getByRole("button", { name: "金額" })).toHaveTextContent("▼");
    expect(within(plannedSection as HTMLElement).getByRole("button", { name: "金額" })).toHaveTextContent("▼");
    expect(getActualDescriptions()).toEqual(["試薬購入", "GPU サーバ保守", "学会出張 精算"]);
    expect(getPlannedDescriptions()).toEqual(["試薬補充", "GPU サーバ保守更新", "学会出張 予定"]);
  });

  it("renders fund detail sections in the persisted settings order", async () => {
    window.localStorage.setItem(
      "budget-dashboard:settings",
      storedAppSettings({
        fundDetailSectionOrder: ["actualEntries", "plannedItems", "categories", "timeline"],
        executionRateThresholds: {
          notice: 50,
          warning: 80,
          alert: 100,
        },
        balanceRateThresholds: {
          notice: 50,
          warning: 20,
          alert: 0,
        },
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
            budgetAmount: 500000,
            plannedAmount: 280000,
            actualAmount: 300000,
          },
        ],
        monthlyStatus: [{ month: "2026-06", plannedAmount: 200000, actualAmount: 300000, totalAmount: 500000 }],
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
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);

    await fundPage.findByRole("heading", { name: "精算項目一覧" });

    const panelHeadings = Array.from(view.container.querySelectorAll(".detail-panel h3")).map(
      (element) => element.textContent,
    );

    expect(panelHeadings).toEqual([
      "精算項目一覧",
      "計画項目一覧",
      "費目別の状況",
      "月別の状況",
    ]);
  });

  it("reveals actual and planned item notes on row hover and keeps them pinned after click on hover-capable pointers", async () => {
    setHoverCapablePointer(true);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
        categories: [],
        monthlyStatus: [],
        actualEntries: [
          {
            id: 8,
            actualDate: "2026-06-20",
            categoryName: "物品費",
            description: "GPU サーバ保守",
            amount: 300000,
            notes: "保守契約の更新費用",
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
            notes: "未精算",
          },
        ],
      }),
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const historyTable = await fundPage.findByRole("table", { name: "精算項目一覧" });
    const plannedTable = fundPage.getByRole("table", { name: "計画項目一覧" });
    const actualEntry = within(historyTable)
      .getByText("GPU サーバ保守")
      .closest(".detail-history-entry");
    const plannedEntry = within(plannedTable)
      .getByText("GPU サーバ保守更新")
      .closest(".detail-history-entry");

    expect(actualEntry).not.toBeNull();
    expect(plannedEntry).not.toBeNull();
    expect(within(historyTable).getByRole("img", { name: "メモあり" })).toBeInTheDocument();
    expect(within(plannedTable).getByRole("img", { name: "メモあり" })).toBeInTheDocument();
    expect(fundPage.queryByText("保守契約の更新費用")).not.toBeInTheDocument();
    expect(fundPage.queryByText("未精算")).not.toBeInTheDocument();

    fireEvent.mouseEnter(actualEntry as HTMLElement);

    expect(fundPage.getByText("保守契約の更新費用")).toBeInTheDocument();

    fireEvent.click(actualEntry as HTMLElement);
    fireEvent.mouseLeave(actualEntry as HTMLElement);

    expect(fundPage.getByText("保守契約の更新費用")).toBeInTheDocument();

    fireEvent.click(actualEntry as HTMLElement);

    expect(fundPage.queryByText("保守契約の更新費用")).not.toBeInTheDocument();

    fireEvent.mouseEnter(plannedEntry as HTMLElement);

    expect(fundPage.getByText("未精算")).toBeInTheDocument();

    fireEvent.mouseLeave(plannedEntry as HTMLElement);

    expect(fundPage.queryByText("未精算")).not.toBeInTheDocument();
  });
});
