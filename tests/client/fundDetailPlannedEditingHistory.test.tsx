import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fetchMock, renderAppRoute, setupFundDetailTests } from "./fundDetailTestUtils";

describe("Fund detail interactions", () => {
  setupFundDetailTests();

  it("scopes planned-item destination choices to the displayed historical fiscal year", async () => {
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
    const plannedTable = await fundPage.findByRole("table", { name: "計画項目一覧" });

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
        plannedDate: "2026-07-10",
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

  it("preserves the planned item category when editing non-ID fields", async () => {
    const user = userEvent.setup();
    let submittedPayload: unknown;
    const currentFundDetail = {
      fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
      categories: [
        {
          id: 1,
          categoryName: "物品費",
          budgetAmount: 1000000,
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

      if (url === "/api/overview" && method === "GET") {
        return {
          ok: true,
          json: async () => ({ funds: [{ id: 1, name: "基盤研究費" }] }),
        };
      }

      if (url === "/api/planned-items/10" && method === "PUT") {
        submittedPayload = JSON.parse(String(init?.body));
        return {
          ok: true,
          json: async () => ({ warnings: [] }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const plannedTable = await fundPage.findByRole("table", { name: "計画項目一覧" });

    await user.click(within(plannedTable).getByRole("button", { name: "編集" }));

    const dialog = await screen.findByRole("dialog", { name: "計画項目を編集" });
    fireEvent.change(within(dialog).getByLabelText("説明"), {
      target: { value: "GPU サーバ保守更新 改" },
    });
    await user.click(within(dialog).getByRole("button", { name: "更新を保存" }));

    expect(submittedPayload).toMatchObject({
      fundId: 1,
      categoryId: 1,
      scheduledMonth: "2026-07",
      description: "GPU サーバ保守更新 改",
      amount: 280000,
      notes: "未精算",
      auxiliaryLabelIds: [],
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
    const plannedTable = await fundPage.findByRole("table", { name: "計画項目一覧" });

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
    const plannedTable = await fundPage.findByRole("table", { name: "計画項目一覧" });

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
    const plannedTable = await fundPage.findByRole("table", { name: "計画項目一覧" });

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
    const historyTable = await fundPage.findByRole("table", { name: "完了・取消済項目一覧" });
    const cancelledRow = within(historyTable).getByText("取消済み研究会").closest(".detail-history-entry");

    expect(cancelledRow).not.toBeNull();
    expect(within(cancelledRow as HTMLElement).getByRole("button", { name: "削除" })).toBeInTheDocument();

    await user.click(within(cancelledRow as HTMLElement).getByRole("button", { name: "再計画" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/planned-items/10/restore", {
      method: "POST",
    });
    const plannedTable = await fundPage.findByRole("table", { name: "計画項目一覧" });
    expect(within(plannedTable).getByText("取消済み研究会")).toBeInTheDocument();
  });
});
