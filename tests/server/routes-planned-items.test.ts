import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRouteTestContext } from "./routeTestUtils";

describe("API planned-item routes", () => {
  let app: Awaited<ReturnType<typeof createRouteTestContext>>["app"];
  let cleanupContext: () => Promise<void>;
  const cleanups: Array<() => void> = [];

  beforeEach(async () => {
    cleanups.length = 0;
    const context = await createRouteTestContext("test-routes-planned-items.db");
    app = context.app;
    cleanupContext = context.cleanup;
  });

  afterEach(async () => {
    await cleanupContext();
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  it("creates a planned item and returns warnings", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items",
      payload: {
        fundId: 1,
        categoryId: 1,
        plannedDate: "2026-10-01",
        scheduledMonth: "2026-10",
        description: "追加出張",
        amount: 50000,
        notes: "",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toHaveProperty("warnings");
  });

  it("creates planned items in bulk and aggregates duplicate warnings", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items/bulk",
      payload: {
        fundId: 1,
        categoryId: 1,
        plannedDate: "2026-10-01",
        notes: "TA monthly",
        auxiliaryLabelIds: [],
        items: [
          {
            scheduledMonth: "2026-10",
            description: "TA賃金 2026-10",
            amount: 1000000,
          },
          {
            scheduledMonth: "2026-11",
            description: "TA賃金 2026-11",
            amount: 1000000,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      createdCount: 2,
      warnings: ["Category budget exceeded for 物品費"],
    });
    expect(
      app.db
        .prepare(
          "SELECT scheduled_month, description, amount, notes FROM planned_items WHERE description LIKE 'TA賃金%' ORDER BY scheduled_month",
        )
        .all(),
    ).toEqual([
      {
        scheduled_month: "2026-10",
        description: "TA賃金 2026-10",
        amount: 1000000,
        notes: "TA monthly",
      },
      {
        scheduled_month: "2026-11",
        description: "TA賃金 2026-11",
        amount: 1000000,
        notes: "TA monthly",
      },
    ]);
  });

  it("does not save any bulk planned items when one row is invalid", async () => {
    const beforeCount = app.db
      .prepare("SELECT COUNT(*) AS count FROM planned_items")
      .get() as { count: number };

    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items/bulk",
      payload: {
        fundId: 1,
        categoryId: 1,
        plannedDate: "2026-10-01",
        notes: "",
        auxiliaryLabelIds: [],
        items: [
          {
            scheduledMonth: "2026-10",
            description: "AIサブスク 2026-10",
            amount: 3000,
          },
          {
            scheduledMonth: "2026-11",
            description: "",
            amount: 3000,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(
      app.db
        .prepare("SELECT COUNT(*) AS count FROM planned_items")
        .get(),
    ).toEqual(beforeCount);
    expect(
      app.db
        .prepare("SELECT COUNT(*) AS count FROM planned_items WHERE description LIKE 'AIサブスク%'")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("returns 400 when planned-item amount exceeds the safe integer limit", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items",
      payload: {
        fundId: 1,
        categoryId: 1,
        plannedDate: "2026-10-01",
        scheduledMonth: "2026-10",
        description: "巨大な支出",
        amount: Number.MAX_SAFE_INTEGER + 1,
        notes: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "invalid_payload",
      message: "入力内容を確認してください。",
    });
  });

  it("returns 400 for invalid planned-item input", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items",
      payload: {
        fundId: 1,
        categoryId: 1,
        plannedDate: "2026-10-01",
        scheduledMonth: "2026-10",
        description: "",
        amount: 50000,
        notes: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "invalid_payload",
      message: "入力内容を確認してください。",
    });
  });

  it("returns 400 for nonexistent planned-item fund or category references", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items",
      payload: {
        fundId: 999,
        categoryId: 999,
        plannedDate: "2026-10-01",
        scheduledMonth: "2026-10",
        description: "存在しない参照",
        amount: 50000,
        notes: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "invalid_reference",
      message: "選択した資金IDまたは費目IDを確認してください。",
    });
  });

  it("returns 400 for mismatched-but-existing planned-item fund and category references", async () => {
    app.db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES (2, '別基金', 2026, 100000, 2);
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order) VALUES (2, 2, 'category-2', '消耗品費', 'equipment', 1);
    `);

    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items",
      payload: {
        fundId: 1,
        categoryId: 2,
        plannedDate: "2026-10-01",
        scheduledMonth: "2026-10",
        description: "不整合な参照",
        amount: 50000,
        notes: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "category_fund_mismatch",
      message: "選択した費目が資金に紐づいていません。",
    });
  });

  it("deletes a cancelled planned item and its auxiliary labels", async () => {
    app.db.exec(`
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount, status) VALUES
        (2, 1, 1, '2026-10-20', '2026-10', '取消済み予定', 3000, 'cancelled');
      INSERT INTO classification_tags (id, kind, name, color) VALUES
        (20, 'auxiliary', '削除確認', '#b91c1c');
      INSERT INTO classification_assignments (tag_id, target_type, target_id) VALUES
        (20, 'planned_item', 2);
    `);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/planned-items/2",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(app.db.prepare("SELECT id FROM planned_items WHERE id = ?").get(2)).toBeUndefined();
    expect(
      app.db
        .prepare("SELECT tag_id FROM classification_assignments WHERE target_type = 'planned_item' AND target_id = ?")
        .all(2),
    ).toEqual([]);
  });

  it("deletes an unlinked planned item and its auxiliary labels", async () => {
    app.db.exec(`
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount, status) VALUES
        (2, 1, 1, '2026-10-20', '2026-10', '計画中予定', 3000, 'planned');
      INSERT INTO classification_tags (id, kind, name, color) VALUES
        (20, 'auxiliary', '削除確認', '#b91c1c');
      INSERT INTO classification_assignments (tag_id, target_type, target_id) VALUES
        (20, 'planned_item', 2);
    `);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/planned-items/2",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(app.db.prepare("SELECT id FROM planned_items WHERE id = ?").get(2)).toBeUndefined();
    expect(
      app.db
        .prepare("SELECT tag_id FROM classification_assignments WHERE target_type = 'planned_item' AND target_id = ?")
        .all(2),
    ).toEqual([]);
  });

  it("returns 409 when deleting a planned item with linked actual entries", async () => {
    app.db.exec(`
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount, status) VALUES
        (2, 1, 1, '2026-10-20', '2026-10', '計画中予定', 3000, 'planned');
      INSERT INTO actual_entries (id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes) VALUES
        (10, 1, 1, 2, '2026-10-21', '精算済み', 3000, '');
    `);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/planned-items/2",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "planned_item_delete_has_actuals",
      message: "精算が紐づいている計画項目は削除できません。",
    });
  });

  it("marks a partially settled planned item as completed through the API", async () => {
    app.db.exec(`
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount, status) VALUES
        (2, 1, 1, '2026-10-20', '2026-10', '部分精算予定', 3000, 'planned');
      INSERT INTO actual_entries (id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes) VALUES
        (10, 1, 1, 2, '2026-10-21', '部分精算', 1000, '');
    `);

    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items/2/complete",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(
      app.db
        .prepare("SELECT amount, status FROM planned_items WHERE id = ?")
        .get(2),
    ).toEqual({ amount: 3000, status: "completed" });
  });

  it("returns 409 when completing a planned item with no linked actual entries", async () => {
    app.db.exec(`
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount, status) VALUES
        (2, 1, 1, '2026-10-20', '2026-10', '未精算予定', 3000, 'planned');
    `);

    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items/2/complete",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "planned_item_complete_requires_actuals",
      message: "精算が紐づいている未精算の計画項目のみ完了にできます。",
    });
  });

  it("restores a cancelled planned item to planned status", async () => {
    app.db.exec(`
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount, status) VALUES
        (2, 1, 1, '2026-10-20', '2026-10', '取消済み予定', 3000, 'cancelled');
    `);

    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items/2/restore",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(
      app.db
        .prepare("SELECT status FROM planned_items WHERE id = ?")
        .get(2),
    ).toEqual({ status: "planned" });
  });

  it("rejects restoring a planned item that is not cancelled", async () => {
    app.db.exec(`
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount, status) VALUES
        (2, 1, 1, '2026-10-20', '2026-10', '計画中予定', 3000, 'planned');
    `);

    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items/2/restore",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "planned_item_not_cancelled_for_restore",
      message: "完了または取消済みの計画項目のみ計画に戻せます。",
    });
  });

  it("updates editable planned item fields", async () => {
    app.db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES (2, 'ACT-X', 2026, 100000, 2);
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order) VALUES (2, 2, 'category-2', '旅費', 'travel', 1);
      INSERT INTO planned_items (id, fund_id, category_id, planned_ref, planned_date, scheduled_month, description, amount, notes) VALUES
        (2, 1, 1, 'immutable-ref', '2026-10-20', '2026-10', '未リンクの予定', 3000, '旧メモ');
      INSERT INTO actual_entries (id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes) VALUES
        (10, 1, 1, 2, '2026-10-21', '第1回支払', 1000, '');
    `);

    const response = await app.inject({
      method: "PUT",
      url: "/api/planned-items/2",
      payload: {
        fundId: 2,
        categoryId: 2,
        plannedDate: "2026-10-25",
        scheduledMonth: "2026-11",
        description: "更新後の予定",
        amount: 4500,
        notes: "新メモ",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      warnings: ["Category budget exceeded for 旅費"],
    });
    expect(
      app.db
        .prepare(
          "SELECT fund_id, category_id, planned_ref, planned_date, scheduled_month, description, amount, notes FROM planned_items WHERE id = ?",
        )
        .get(2),
    ).toEqual({
      fund_id: 2,
      category_id: 2,
      planned_ref: "immutable-ref",
      planned_date: "2026-10-25",
      scheduled_month: "2026-11",
      description: "更新後の予定",
      amount: 4500,
      notes: "新メモ",
    });
    expect(
      app.db
        .prepare("SELECT fund_id, category_id FROM actual_entries WHERE planned_item_id = ?")
        .all(2),
    ).toEqual([{ fund_id: 2, category_id: 2 }]);
  });

  it("returns 409 when cancelling a planned item with linked actual entries", async () => {
    app.db.exec(`
      INSERT INTO actual_entries (id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes) VALUES
        (2, 1, 1, 1, '2026-10-10', '部分精算', 1000, '');
    `);

    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items/1/cancel",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "planned_item_has_actuals",
      message: "精算が紐づいている計画項目は取り消せません。",
    });
  });

});
