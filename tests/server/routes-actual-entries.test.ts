import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRouteTestContext } from "./routeTestUtils";

describe("API actual-entry routes", () => {
  let app: Awaited<ReturnType<typeof createRouteTestContext>>["app"];
  let cleanupContext: () => Promise<void>;
  const cleanups: Array<() => void> = [];

  beforeEach(async () => {
    cleanups.length = 0;
    const context = await createRouteTestContext("test-routes-actual-entries.db");
    app = context.app;
    cleanupContext = context.cleanup;
  });

  afterEach(async () => {
    await cleanupContext();
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  it("creates an unlinked actual entry", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/actual-entries",
      payload: {
        fundId: 1,
        categoryId: 1,
        actualDate: "2026-09-16",
        description: "単発の実績",
        amount: 1000,
        notes: "",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ remainingPlannedAmount: null });
  });

  it("updates editable actual entry fields", async () => {
    app.db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES (2, 'ACT-X', 2026, 100000, 2);
      INSERT INTO categories (id, fund_id, name, cross_aggregate_category, display_order) VALUES (2, 2, '旅費', 'travel', 1);
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount, notes) VALUES
        (20, 1, 1, '2026-10-01', '2026-10', '関連計画', 70000, '');
      INSERT INTO actual_entries (id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes) VALUES
        (21, 1, 1, 20, '2026-10-05', '着手金', 50000, '旧メモ'),
        (22, 1, 1, 20, '2026-10-10', '残金', 20000, '');
    `);

    const response = await app.inject({
      method: "PUT",
      url: "/api/actual-entries/21",
      payload: {
        fundId: 2,
        categoryId: 2,
        actualDate: "2026-10-12",
        description: "着手金 改",
        amount: 62000,
        notes: "更新メモ",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(
      app.db
        .prepare(
          "SELECT fund_id, category_id, actual_date, description, amount, notes FROM actual_entries WHERE id = ?",
        )
        .get(21),
    ).toEqual({
      fund_id: 2,
      category_id: 2,
      actual_date: "2026-10-12",
      description: "着手金 改",
      amount: 62000,
      notes: "更新メモ",
    });
    expect(
      app.db
        .prepare("SELECT fund_id, category_id FROM planned_items WHERE id = ?")
        .get(20),
    ).toEqual({ fund_id: 2, category_id: 2 });
    expect(
      app.db
        .prepare("SELECT id, fund_id, category_id FROM actual_entries WHERE planned_item_id = ? ORDER BY id")
        .all(20),
    ).toEqual([
      { id: 21, fund_id: 2, category_id: 2 },
      { id: 22, fund_id: 2, category_id: 2 },
    ]);
  });

  it("cancels an actual entry", async () => {

    const response = await app.inject({
      method: "POST",
      url: "/api/actual-entries/1/cancel",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(app.db.prepare("SELECT id FROM actual_entries WHERE id = ?").get(1)).toBeUndefined();
  });

  it.each([
    {
      name: "update",
      request: {
        method: "PUT" as const,
        url: "/api/actual-entries/not-a-number",
        payload: {
          fundId: 1,
          categoryId: 1,
          actualDate: "2026-10-12",
          description: "着手金 改",
          amount: 62000,
          notes: "更新メモ",
        },
      },
    },
    {
      name: "cancel",
      request: {
        method: "POST" as const,
        url: "/api/actual-entries/not-a-number/cancel",
      },
    },
  ])("returns 400 for an invalid actual entry id on $name", async ({ request }) => {
    const response = await app.inject(request);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid actual entry id" });
  });

  it("returns 400 for mismatched-but-existing actual-entry fund and category references", async () => {
    app.db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES (2, '別基金', 2026, 100000, 2);
      INSERT INTO categories (id, fund_id, name, cross_aggregate_category, display_order) VALUES (2, 2, '消耗品費', 'equipment', 1);
    `);

    const response = await app.inject({
      method: "POST",
      url: "/api/actual-entries",
      payload: {
        fundId: 1,
        categoryId: 2,
        actualDate: "2026-09-16",
        description: "不整合な参照",
        amount: 1000,
        notes: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "category_fund_mismatch",
      error: "Invalid request payload",
      message: "選択した費目が資金に紐づいていません。",
    });
  });
});
