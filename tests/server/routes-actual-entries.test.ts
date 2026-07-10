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

  it("creates a linked actual entry and completes the planned item when remaining amount is not kept", async () => {
    app.db.exec(`
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount, status, notes) VALUES
        (20, 1, 1, '2026-10-01', '2026-10', '部分精算予定', 70000, 'planned', '');
    `);

    const response = await app.inject({
      method: "POST",
      url: "/api/actual-entries",
      payload: {
        fundId: 1,
        categoryId: 1,
        plannedItemId: 20,
        actualDate: "2026-10-10",
        description: "部分精算",
        amount: 50000,
        notes: "",
        keepRemainingPlanned: false,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ remainingPlannedAmount: 20000 });
    expect(app.db.prepare("SELECT status FROM planned_items WHERE id = ?").get(20)).toEqual({
      status: "completed",
    });
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
    app.db.exec(`
      INSERT INTO classification_tags (id, kind, name, color) VALUES
        (10, 'auxiliary', '要確認', '#7c3aed');
      INSERT INTO classification_assignments (tag_id, target_type, target_id) VALUES
        (10, 'fund', 1),
        (10, 'planned_item', 1),
        (10, 'actual_entry', 1);
    `);

    const response = await app.inject({
      method: "POST",
      url: "/api/actual-entries/1/cancel",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(app.db.prepare("SELECT id FROM actual_entries WHERE id = ?").get(1)).toBeUndefined();
    expect(
      app.db
        .prepare(
          `
          SELECT tag_id
          FROM classification_assignments
          WHERE target_type = 'actual_entry'
            AND target_id = 1
          `,
        )
        .all(),
    ).toEqual([]);
    expect(
      app.db
        .prepare(
          `
          SELECT target_type
          FROM classification_assignments
          WHERE tag_id = 10
          ORDER BY target_type
          `,
        )
        .all(),
    ).toEqual([{ target_type: "fund" }, { target_type: "planned_item" }]);
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
    expect(response.json()).toEqual({
      code: "invalid_actual_entry_id",
      message: "精算項目IDを確認してください。",
    });
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
      message: "選択した費目が資金に紐づいていません。",
    });
  });
});
