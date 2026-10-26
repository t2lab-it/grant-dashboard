import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { handleStaticDemoRequest, resetStaticDemoStore } from "../../src/demo/staticDemoApi";
import { readStaticDemoState } from "../../src/demo/staticDemoState";
import type { FundDetailResponse } from "../../src/features/funds/fundDetailTypes";
import { queryKeys } from "../../src/lib/queryKeys";
import { fetchMock, renderAppRoute, setupFundDetailTests } from "./fundDetailTestUtils";

describe("Fund detail interactions", () => {
  setupFundDetailTests();

  it("keeps a partially settled demo item and its remaining amount after repeated edits", async () => {
    resetStaticDemoStore();
    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      return handleStaticDemoRequest(url, init);
    });
    const user = userEvent.setup();
    const view = renderAppRoute("/funds/1");
    let description = "GPUサーバ更新";
    for (const month of ["2026-08", "2026-09"]) {
      const table = await within(view.container).findByRole("table", { name: "予定" });
      const row = within(table).getByText(description).closest('[role="row"]')!;
      await user.click(within(row as HTMLElement).getByRole("button", { name: "編集" }));
      const dialog = await screen.findByRole("dialog", { name: "予定を編集" });
      expect(within(dialog).getByText("金額（未精算残額）")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("金額")).toHaveValue("400000");
      description = `GPUサーバ更新 ${month}`;
      fireEvent.change(within(dialog).getByLabelText("内容"), { target: { value: description } });
      fireEvent.change(within(dialog).getByLabelText("執行予定月"), { target: { value: month } });
      fireEvent.change(within(dialog).getByLabelText("メモ"), { target: { value: "残額を維持" } });
      await user.click(within(dialog).getByRole("button", { name: "更新を保存" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "予定を編集" })).not.toBeInTheDocument());
      expect(readStaticDemoState().planned_items.find((item) => item.id === 1)).toMatchObject({
        fund_id: 1,
        category_id: 1,
        planned_date: "2026-05-15",
        scheduled_month: month,
        description,
        amount: 700000,
        notes: "残額を維持",
      });
      const detail = await (await handleStaticDemoRequest("/api/funds/1")).json() as FundDetailResponse;
      expect(detail.plannedItems.find((item) => item.id === 1)).toMatchObject({
        categoryId: 1,
        amount: 400000,
        description,
        scheduledMonth: month,
      });
    }
  });

  it("edits a planned item with historical-year destinations and a calendar-selected month", async () => {
    const user = userEvent.setup();
    const overviewResponse = {
      funds: [
        { id: 1, name: "基盤研究費" },
        { id: 2, name: "ACT-X" },
      ],
    };
    let currentFundDetail: {
      fund: { id: number; name: string; fiscalYear: number; awarded_amount: number };
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
      plannedItemHistory: FundDetailResponse["plannedItemHistory"];
      crossAggregateCategories: FundDetailResponse["crossAggregateCategories"];
    } = {
      fund: { id: 1, name: "基盤研究費", fiscalYear: 2024, awarded_amount: 5080000 },
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
      plannedItemHistory: [],
      crossAggregateCategories: [],
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

      if (url === "/api/overview?year=2024" && method === "GET") {
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
    const plannedTable = await fundPage.findByRole("table", { name: "予定" });

    await user.click(within(plannedTable).getByRole("button", { name: "編集" }));

    const dialog = await screen.findByRole("dialog", { name: "予定を編集" });
    expect(within(dialog).getByRole("button", { name: "閉じる" })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("予算"), {
      target: { value: "2" },
    });
    await screen.findByRole("option", { name: "旅費" });
    expect(view.queryClient.getQueryData(queryKeys.fund.detail(2))).toBeUndefined();
    fireEvent.change(within(dialog).getByLabelText("費目"), {
      target: { value: "2" },
    });
    const scheduledMonthInput = within(dialog).getByLabelText("執行予定月");
    expect(scheduledMonthInput).toHaveValue("2026/07");
    const calendarButton = within(dialog).getByRole("button", {
      name: "執行予定月カレンダーを開く",
    });
    await user.click(calendarButton);
    const calendar = within(dialog).getByRole("dialog", { name: "執行予定月カレンダー" });
    expect(within(calendar).getByRole("button", { name: "2026/07" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).queryByRole("dialog", { name: "執行予定月カレンダー" })).not.toBeInTheDocument();
    await user.click(calendarButton);
    await user.click(within(dialog).getByRole("button", { name: "2026/08" }));
    expect(scheduledMonthInput).toHaveValue("2026/08");
    expect(within(dialog).queryByRole("dialog", { name: "執行予定月カレンダー" })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("内容"), {
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
        plannedDate: "2026-07-10",
        scheduledMonth: "2026-08",
        description: "GPU サーバ保守更新 改",
        amount: 300000,
        notes: "更新後メモ",
        auxiliaryLabelIds: [],
      }),
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "予定を編集" })).not.toBeInTheDocument();
    });
  });

  it("deletes planned items from the edit modal", async () => {
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
      plannedItemHistory: [],
      crossAggregateCategories: [],
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
    const plannedTable = await fundPage.findByRole("table", { name: "予定" });

    await user.click(within(plannedTable).getByRole("button", { name: "編集" }));

    const dialog = await screen.findByRole("dialog", { name: "予定を編集" });
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "削除" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/planned-items/10", {
      method: "DELETE",
    });
    expect(await fundPage.findByText("未精算の予定はまだありません。")).toBeInTheDocument();
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
      plannedItemHistory: [],
      crossAggregateCategories: [],
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
    const plannedTable = await fundPage.findByRole("table", { name: "予定" });

    await user.click(within(plannedTable).getByRole("button", { name: "編集" }));

    const dialog = await screen.findByRole("dialog", { name: "予定を編集" });
    fireEvent.change(within(dialog).getByLabelText("予算"), {
      target: { value: "2" },
    });
    await screen.findByRole("option", { name: "旅費" });
    fireEvent.change(within(dialog).getByLabelText("費目"), {
      target: { value: "2" },
    });
    fireEvent.change(within(dialog).getByLabelText("執行予定月"), {
      target: { value: "2026-08" },
    });
    fireEvent.change(within(dialog).getByLabelText("内容"), {
      target: { value: "GPU サーバ保守更新 改" },
    });
    fireEvent.change(within(dialog).getByLabelText("金額"), {
      target: { value: "300000" },
    });
    fireEvent.change(within(dialog).getByLabelText("メモ"), {
      target: { value: "更新後メモ" },
    });
    await user.click(within(dialog).getByRole("button", { name: "更新を保存" }));

    expect(await screen.findByRole("dialog", { name: "予定を編集" })).toBeInTheDocument();
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
      crossAggregateCategories: [],
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
    const historyTable = await fundPage.findByRole("table", { name: "完了・取消済項目一覧" });
    const cancelledRow = within(historyTable).getByText("取消済み研究会").closest(".detail-history-entry");

    expect(cancelledRow).not.toBeNull();
    expect(within(cancelledRow as HTMLElement).getByRole("button", { name: "削除" })).toBeInTheDocument();

    await user.click(within(cancelledRow as HTMLElement).getByRole("button", { name: "再計画" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/planned-items/10/restore", {
      method: "POST",
    });
    const plannedTable = await fundPage.findByRole("table", { name: "予定" });
    expect(within(plannedTable).getByText("取消済み研究会")).toBeInTheDocument();
  });
});
