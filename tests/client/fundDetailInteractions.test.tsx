import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchMock, renderAppRoute, resetOverviewTestState, setHoverCapablePointer } from "./overviewTestUtils";
import { storedAppSettings } from "./testUtils";

describe("Fund detail interactions", () => {
  beforeEach(() => {
    resetOverviewTestState();
  });

  afterEach(() => {
    cleanup();
  });

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
    expect(within(dialog).getByRole("region", { name: "費目予算の合計確認" })).toHaveTextContent(
      /差額\s*4,080,000円/,
    );

    await user.clear(within(dialog).getByLabelText("予算名"));
    await user.type(within(dialog).getByLabelText("予算名"), "基盤研究費 改");
    await user.clear(within(dialog).getByLabelText("年度"));
    await user.type(within(dialog).getByLabelText("年度"), "2027");
    await user.clear(within(dialog).getByLabelText("交付額"));
    await user.type(within(dialog).getByLabelText("交付額"), "900000");
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "保存" })).toHaveClass("budget-entry-submit-disabled");
    expect(within(dialog).getByText("費目予算の合計が交付額を超えています。")).toBeInTheDocument();
    expect(within(dialog).getByRole("region", { name: "費目予算の合計確認" })).toHaveTextContent(
      /差額\s*-100,000円/,
    );
    await user.clear(within(dialog).getByLabelText("交付額"));
    await user.type(within(dialog).getByLabelText("交付額"), "6,000,000 + 100,000");
    expect(within(dialog).queryByText("費目予算の合計が交付額を超えています。")).not.toBeInTheDocument();
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
    expect(within(dialog).getByRole("region", { name: "費目予算の合計確認" })).toHaveTextContent(
      /差額\s*4,450,000円/,
    );
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
    expect(within(fundPage.getByRole("region", { name: "Fund summary" })).getAllByText("6,100,000円")).toHaveLength(2);
    const categoryTable = fundPage.getByRole("table", { name: "Fund categories" });
    expect(within(categoryTable).getByText("設備費")).toBeInTheDocument();
    expect(within(categoryTable).getByText("外注費")).toBeInTheDocument();
  }, 10_000);

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

  it("shows action buttons for planned items and opens a settlement modal that submits the linked actual entry", async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
    let currentFundDetail: {
      fund: { id: number; name: string; awarded_amount: number };
      categories: Array<{
        id: number;
        categoryName: string;
        budgetAmount: number | null;
        plannedAmount: number;
        actualAmount: number;
      }>;
      monthlyStatus: Array<{
        month: string;
        plannedAmount: number;
        actualAmount: number;
        totalAmount: number;
      }>;
      actualEntries: Array<{
        id: number;
        actualDate: string;
        categoryName: string;
        description: string;
        amount: number;
        notes: string;
      }>;
      plannedItems: Array<{
        id: number;
        plannedDate: string;
        scheduledMonth: string;
        categoryId: number;
        categoryName: string;
        description: string;
        amount: number;
        notes: string;
      }>;
    } = {
      fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
      categories: [
        {
          id: 1,
          categoryName: "物品費",
          budgetAmount: 150000,
          plannedAmount: 280000,
          actualAmount: 0,
        },
      ],
      monthlyStatus: [],
      actualEntries: [],
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

      if (url === "/api/actual-entries" && method === "POST") {
        currentFundDetail = {
          ...currentFundDetail,
          actualEntries: [
            {
              id: 11,
              actualDate: "2026-07-31",
              categoryName: "物品費",
              description: "GPU サーバ保守更新",
              amount: 280000,
              notes: "未精算",
            },
          ],
          plannedItems: [],
        };

        return {
          ok: true,
          json: async () => ({ remainingPlannedAmount: 0 }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const plannedTable = await fundPage.findByRole("table", { name: "Fund planned items" });

    await user.click(within(plannedTable).getByRole("button", { name: "精算" }));

    const dialog = await screen.findByRole("dialog", { name: "計画項目を精算" });
    expect(within(dialog).getByLabelText("実績日")).toHaveValue(today);
    expect(within(dialog).getByLabelText("実績日カレンダー")).toHaveAttribute("type", "date");
    expect(within(dialog).getByLabelText("説明")).toHaveValue("GPU サーバ保守更新");
    expect(within(dialog).getByLabelText("金額")).toHaveValue("280000");
    expect(within(dialog).getByRole("button", { name: "閉じる" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "キャンセル" })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("実績日カレンダー"), {
      target: { value: "2026-07-31" },
    });
    expect(within(dialog).getByLabelText("実績日")).toHaveValue("2026/07/31");
    await user.click(within(dialog).getByRole("button", { name: "精算を登録" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/actual-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 1,
        categoryId: 1,
        plannedItemId: 10,
        actualDate: "2026-07-31",
        description: "GPU サーバ保守更新",
        amount: 280000,
        notes: "未精算",
        auxiliaryLabelIds: [],
        keepRemainingPlanned: false,
      }),
    });
    expect(await fundPage.findByText("未精算の計画項目はまだありません。")).toBeInTheDocument();
    expect(fundPage.getByText("GPU サーバ保守更新")).toBeInTheDocument();
  });

  it("keeps the remaining planned amount when the settlement checkbox is enabled", async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().slice(0, 10);
    const currentFundDetail = {
      fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
      categories: [],
      monthlyStatus: [],
      actualEntries: [],
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
    };

    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url === "/api/funds/1" && method === "GET") {
        return { ok: true, json: async () => currentFundDetail };
      }

      if (url === "/api/actual-entries" && method === "POST") {
        return { ok: true, json: async () => ({ remainingPlannedAmount: 120000 }) };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const plannedTable = await fundPage.findByRole("table", { name: "Fund planned items" });

    await user.click(within(plannedTable).getByRole("button", { name: "精算" }));
    const dialog = await screen.findByRole("dialog", { name: "計画項目を精算" });
    await user.click(within(dialog).getByRole("checkbox", { name: "残額を予定として残す" }));
    await user.click(within(dialog).getByRole("button", { name: "精算を登録" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/actual-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 1,
        categoryId: 1,
        plannedItemId: 10,
        actualDate: today,
        description: "GPU サーバ保守更新",
        amount: 280000,
        notes: "未精算",
        auxiliaryLabelIds: [],
        keepRemainingPlanned: true,
      }),
    });
  });

  it("duplicates planned items from the planned list with today as the planned date", async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().slice(0, 10);
    let currentFundDetail = {
      fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
      categories: [
        {
          id: 1,
          categoryName: "物品費",
          budgetAmount: 150000,
          plannedAmount: 280000,
          actualAmount: 0,
        },
      ],
      monthlyStatus: [],
      actualEntries: [],
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
          auxiliaryLabels: [{ id: 5, kind: "auxiliary", name: "要確認", color: "#16a34a" }],
        },
      ],
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

      if (url === "/api/classifications" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            projectTags: [],
            auxiliaryLabels: [{ id: 5, kind: "auxiliary", name: "要確認", color: "#16a34a" }],
          }),
        };
      }

      if (url === "/api/planned-items" && method === "POST") {
        return {
          ok: true,
          json: async () => ({ warnings: [] }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const plannedTable = await fundPage.findByRole("table", { name: "Fund planned items" });

    await user.click(within(plannedTable).getByRole("button", { name: "複製" }));

    const dialog = await screen.findByRole("dialog", { name: "計画項目を複製" });
    await user.click(within(dialog).getByRole("button", { name: "複製を保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/planned-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 1,
        categoryId: 1,
        plannedDate: today,
        scheduledMonth: "2026-07",
        description: "GPU サーバ保守更新",
        amount: 280000,
        notes: "未精算",
        auxiliaryLabelIds: [5],
      }),
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "計画項目を複製" })).not.toBeInTheDocument();
    });
  });

  it("duplicates actual entries from the actual list without copying the planned item link", async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().slice(0, 10);
    let currentFundDetail = {
      fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
      categories: [
        {
          id: 1,
          categoryName: "物品費",
          budgetAmount: 150000,
          plannedAmount: 0,
          actualAmount: 300000,
        },
      ],
      monthlyStatus: [],
      actualEntries: [
        {
          id: 8,
          actualDate: "2026-06-20",
          categoryId: 1,
          categoryName: "物品費",
          description: "GPU サーバ保守",
          amount: 300000,
          notes: "保守契約の更新費用",
          auxiliaryLabels: [{ id: 5, kind: "auxiliary", name: "要確認", color: "#16a34a" }],
        },
      ],
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

      if (url === "/api/classifications" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            projectTags: [],
            auxiliaryLabels: [{ id: 5, kind: "auxiliary", name: "要確認", color: "#16a34a" }],
          }),
        };
      }

      if (url === "/api/actual-entries" && method === "POST") {
        return {
          ok: true,
          json: async () => ({ remainingPlannedAmount: null }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const actualTable = await fundPage.findByRole("table", { name: "Fund actual entries" });

    await user.click(within(actualTable).getByRole("button", { name: "複製" }));

    const dialog = await screen.findByRole("dialog", { name: "精算項目を複製" });
    fireEvent.change(within(dialog).getByLabelText("金額"), {
      target: { value: "300000" },
    });
    await user.click(within(dialog).getByRole("button", { name: "複製を保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/actual-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 1,
        categoryId: 1,
        actualDate: today,
        description: "GPU サーバ保守",
        amount: 300000,
        notes: "保守契約の更新費用",
        auxiliaryLabelIds: [5],
      }),
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "精算項目を複製" })).not.toBeInTheDocument();
    });
  });

  it("can cancel an actual entry from the edit modal", async () => {
    const user = userEvent.setup();
    let currentFundDetail: {
      fund: { id: number; name: string; awarded_amount: number };
      categories: Array<{
        id: number;
        categoryName: string;
        budgetAmount: number | null;
        plannedAmount: number;
        actualAmount: number;
      }>;
      monthlyStatus: Array<{
        month: string;
        plannedAmount: number;
        actualAmount: number;
        totalAmount: number;
      }>;
      actualEntries: Array<{
        id: number;
        actualDate: string;
        categoryName: string;
        description: string;
        amount: number;
        notes: string;
      }>;
      plannedItems: Array<{
        id: number;
        plannedDate: string;
        scheduledMonth: string;
        categoryId: number;
        categoryName: string;
        description: string;
        amount: number;
        notes: string;
      }>;
    } = {
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

      if (url === "/api/actual-entries/8/cancel" && method === "POST") {
        currentFundDetail = {
          ...currentFundDetail,
          actualEntries: [],
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
    const historyTable = await fundPage.findByRole("table", { name: "Fund actual entries" });

    await user.click(within(historyTable).getByRole("button", { name: "編集" }));

    const dialog = await screen.findByRole("dialog", { name: "精算項目を編集" });
    await user.click(within(dialog).getByRole("button", { name: "精算を取り消す" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/actual-entries/8/cancel", {
      method: "POST",
    });
    expect(await fundPage.findByText("精算済み項目はまだありません。")).toBeInTheDocument();
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
    const historyTable = await fundPage.findByRole("table", { name: "Fund actual entries" });
    const plannedTable = fundPage.getByRole("table", { name: "Fund planned items" });
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

  it("opens an edit modal for planned items and saves the edited fields", async () => {
    const user = userEvent.setup();
    const overviewResponse = {
      funds: [
        { id: 1, name: "基盤研究費" },
        { id: 2, name: "ACT-X" },
      ],
    };
    let currentFundDetail: {
      fund: { id: number; name: string; awarded_amount: number };
      categories: Array<{
        id: number;
        categoryName: string;
        budgetAmount: number | null;
        plannedAmount: number;
        actualAmount: number;
      }>;
      monthlyStatus: Array<{
        month: string;
        plannedAmount: number;
        actualAmount: number;
        totalAmount: number;
      }>;
      actualEntries: Array<{
        id: number;
        actualDate: string;
        categoryName: string;
        description: string;
        amount: number;
        notes: string;
      }>;
      plannedItems: Array<{
        id: number;
        plannedDate: string;
        scheduledMonth: string;
        categoryId: number;
        categoryName: string;
        description: string;
        amount: number;
        notes: string;
      }>;
    } = {
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

      if (url === "/api/funds/2" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            categories: [{ id: 2, categoryName: "旅費" }],
          }),
        };
      }

      if (url === "/api/overview" && method === "GET") {
        return {
          ok: true,
          json: async () => overviewResponse,
        };
      }

      if (url === "/api/planned-items/10" && method === "PUT") {
        currentFundDetail = {
          ...currentFundDetail,
          actualEntries: [],
          plannedItems: [],
        };

        return {
          ok: true,
          json: async () => ({ warnings: [] }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const plannedTable = await fundPage.findByRole("table", { name: "Fund planned items" });

    await user.click(within(plannedTable).getByRole("button", { name: "編集" }));

    const dialog = await screen.findByRole("dialog", { name: "計画項目を編集" });
    expect(within(dialog).getByRole("button", { name: "閉じる" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "キャンセル" })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("資金ID"), {
      target: { value: "2" },
    });
    await screen.findByRole("option", { name: "旅費" });
    fireEvent.change(within(dialog).getByLabelText("費目ID"), {
      target: { value: "2" },
    });
    fireEvent.change(within(dialog).getByLabelText("執行予定月"), {
      target: { value: "2026-08" },
    });
    fireEvent.change(within(dialog).getByLabelText("説明"), {
      target: { value: "GPU サーバ保守更新 改" },
    });
    fireEvent.change(within(dialog).getByLabelText("金額"), {
      target: { value: "300000" },
    });
    fireEvent.change(within(dialog).getByLabelText("メモ"), {
      target: { value: "更新後メモ" },
    });
    await user.click(within(dialog).getByRole("button", { name: "更新を保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/planned-items/10", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 2,
        categoryId: 2,
        scheduledMonth: "2026-08",
        description: "GPU サーバ保守更新 改",
        amount: 300000,
        notes: "更新後メモ",
        auxiliaryLabelIds: [],
      }),
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "計画項目を編集" })).not.toBeInTheDocument();
    });
  });

  it("deletes planned items from the edit modal after moving destructive actions out of the list", async () => {
    const user = userEvent.setup();
    let currentFundDetail = {
      fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
      categories: [],
      monthlyStatus: [],
      actualEntries: [],
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

      if (url === "/api/overview" && method === "GET") {
        return {
          ok: true,
          json: async () => ({ funds: [{ id: 1, name: "基盤研究費" }] }),
        };
      }

      if (url === "/api/planned-items/10" && method === "DELETE") {
        currentFundDetail = {
          ...currentFundDetail,
          plannedItems: [],
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
    const plannedTable = await fundPage.findByRole("table", { name: "Fund planned items" });

    expect(within(plannedTable).queryByRole("button", { name: "削除" })).not.toBeInTheDocument();
    await user.click(within(plannedTable).getByRole("button", { name: "編集" }));

    const dialog = await screen.findByRole("dialog", { name: "計画項目を編集" });
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "削除" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/planned-items/10", {
      method: "DELETE",
    });
    expect(await fundPage.findByText("未精算の計画項目はまだありません。")).toBeInTheDocument();
  });

  it("does not expose manual planned-item completion from the edit modal", async () => {
    const user = userEvent.setup();

    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url === "/api/funds/1" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
            categories: [],
            monthlyStatus: [],
            actualEntries: [],
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
        };
      }

      if (url === "/api/overview" && method === "GET") {
        return { ok: true, json: async () => ({ funds: [{ id: 1, name: "基盤研究費" }] }) };
      }

      throw new Error("Unexpected fetch: " + method + " " + url);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const plannedTable = await fundPage.findByRole("table", { name: "Fund planned items" });

    await user.click(within(plannedTable).getByRole("button", { name: "編集" }));
    const dialog = await screen.findByRole("dialog", { name: "計画項目を編集" });

    expect(within(dialog).queryByRole("button", { name: "残額放棄して完了" })).not.toBeInTheDocument();
  });

  it("keeps destination fund options out of the fund detail query cache", async () => {
    const user = userEvent.setup();
    const overviewResponse = {
      funds: [
        { id: 1, name: "基盤研究費" },
        { id: 2, name: "ACT-X" },
      ],
    };

    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url === "/api/funds/1" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
            categories: [],
            monthlyStatus: [],
            actualEntries: [],
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
        };
      }

      if (url === "/api/funds/2" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            categories: [{ id: 2, categoryName: "旅費" }],
          }),
        };
      }

      if (url === "/api/overview" && method === "GET") {
        return {
          ok: true,
          json: async () => overviewResponse,
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const plannedTable = await fundPage.findByRole("table", { name: "Fund planned items" });

    await user.click(within(plannedTable).getByRole("button", { name: "編集" }));

    const dialog = await screen.findByRole("dialog", { name: "計画項目を編集" });
    fireEvent.change(within(dialog).getByLabelText("資金ID"), {
      target: { value: "2" },
    });
    await screen.findByRole("option", { name: "旅費" });

    expect(view.queryClient.getQueryData(["fund", 2])).toBeUndefined();
  });

  it("keeps the planned item edit modal open when the server returns warnings", async () => {
    const user = userEvent.setup();
    const overviewResponse = {
      funds: [
        { id: 1, name: "基盤研究費" },
        { id: 2, name: "ACT-X" },
      ],
    };
    let currentFundDetail = {
      fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
      categories: [],
      monthlyStatus: [],
      actualEntries: [],
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

      if (url === "/api/funds/2" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            categories: [{ id: 2, categoryName: "旅費" }],
          }),
        };
      }

      if (url === "/api/overview" && method === "GET") {
        return {
          ok: true,
          json: async () => overviewResponse,
        };
      }

      if (url === "/api/planned-items/10" && method === "PUT") {
        currentFundDetail = {
          ...currentFundDetail,
          plannedItems: [
            {
              id: 10,
              plannedDate: "2026-07-10",
              scheduledMonth: "2026-08",
              categoryId: 2,
              categoryName: "旅費",
              description: "GPU サーバ保守更新 改",
              amount: 300000,
              notes: "更新後メモ",
            },
          ],
        };

        return {
          ok: true,
          json: async () => ({ warnings: ["Category budget exceeded for 旅費"] }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const plannedTable = await fundPage.findByRole("table", { name: "Fund planned items" });

    await user.click(within(plannedTable).getByRole("button", { name: "編集" }));

    const dialog = await screen.findByRole("dialog", { name: "計画項目を編集" });
    fireEvent.change(within(dialog).getByLabelText("資金ID"), {
      target: { value: "2" },
    });
    await screen.findByRole("option", { name: "旅費" });
    fireEvent.change(within(dialog).getByLabelText("費目ID"), {
      target: { value: "2" },
    });
    fireEvent.change(within(dialog).getByLabelText("執行予定月"), {
      target: { value: "2026-08" },
    });
    fireEvent.change(within(dialog).getByLabelText("説明"), {
      target: { value: "GPU サーバ保守更新 改" },
    });
    fireEvent.change(within(dialog).getByLabelText("金額"), {
      target: { value: "300000" },
    });
    fireEvent.change(within(dialog).getByLabelText("メモ"), {
      target: { value: "更新後メモ" },
    });
    await user.click(within(dialog).getByRole("button", { name: "更新を保存" }));

    expect(await screen.findByRole("dialog", { name: "計画項目を編集" })).toBeInTheDocument();
    expect(screen.getByText("Category budget exceeded for 旅費")).toBeInTheDocument();
    expect(await fundPage.findByText("GPU サーバ保守更新 改")).toBeInTheDocument();
  });

  it("can restore a cancelled planned item from the planned item history", async () => {
    const user = userEvent.setup();
    let currentFundDetail = {
      fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
      categories: [],
      monthlyStatus: [],
      actualEntries: [],
      plannedItems: [] as Array<{
        id: number;
        plannedDate: string;
        scheduledMonth: string;
        categoryId: number;
        categoryName: string;
        description: string;
        amount: number;
        notes: string;
      }>,
      plannedItemHistory: [
        {
          id: 10,
          plannedDate: "2026-07-10",
          scheduledMonth: "2026-07",
          categoryId: 1,
          categoryName: "物品費",
          description: "取消済み研究会",
          amount: 280000,
          remainingAmount: 0,
          status: "cancelled" as const,
          notes: "",
        },
      ],
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

      if (url === "/api/planned-items/10/restore" && method === "POST") {
        const [restoredItem] = currentFundDetail.plannedItemHistory;
        currentFundDetail = {
          ...currentFundDetail,
          plannedItems: [
            {
              id: restoredItem.id,
              plannedDate: restoredItem.plannedDate,
              scheduledMonth: restoredItem.scheduledMonth,
              categoryId: restoredItem.categoryId,
              categoryName: restoredItem.categoryName,
              description: restoredItem.description,
              amount: restoredItem.amount,
              notes: restoredItem.notes,
            },
          ],
          plannedItemHistory: [],
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
    const historyTable = await fundPage.findByRole("table", { name: "Fund planned item history" });
    const cancelledRow = within(historyTable).getByText("取消済み研究会").closest(".detail-history-entry");

    expect(cancelledRow).not.toBeNull();
    expect(within(cancelledRow as HTMLElement).getByRole("button", { name: "削除" })).toBeInTheDocument();

    await user.click(within(cancelledRow as HTMLElement).getByRole("button", { name: "再計画" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/planned-items/10/restore", {
      method: "POST",
    });
    const plannedTable = await fundPage.findByRole("table", { name: "Fund planned items" });
    expect(within(plannedTable).getByText("取消済み研究会")).toBeInTheDocument();
  });

  it("closes the edit modal on Escape without saving", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url === "/api/funds/1" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
            categories: [],
            monthlyStatus: [],
            actualEntries: [],
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
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const plannedTable = await fundPage.findByRole("table", { name: "Fund planned items" });

    await user.click(within(plannedTable).getByRole("button", { name: "編集" }));
    expect(await screen.findByRole("dialog", { name: "計画項目を編集" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "計画項目を編集" })).not.toBeInTheDocument();
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") !== "GET"),
    ).toHaveLength(0);
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
