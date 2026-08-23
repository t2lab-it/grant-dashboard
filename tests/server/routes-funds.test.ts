import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRouteTestContext } from "./routeTestUtils";

describe("API fund routes", () => {
  let app: Awaited<ReturnType<typeof createRouteTestContext>>["app"];
  let cleanupContext: () => Promise<void>;
  const cleanups: Array<() => void> = [];

  beforeEach(async () => {
    cleanups.length = 0;
    const context = await createRouteTestContext("test-routes-funds.db");
    app = context.app;
    cleanupContext = context.cleanup;
  });

  afterEach(async () => {
    await cleanupContext();
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  it("returns 404 for a missing fund", async () => {
    const response = await app.inject({ method: "GET", url: "/api/funds/999" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: "fund_not_found",
      message: "対象の予算が見つかりません。",
    });
  });

  it("deletes a fund with its accounting rows and classification assignments", async () => {
    app.db.exec(`
      INSERT INTO funds (id, fund_code, name, fiscal_year, awarded_amount, notes, display_order)
      VALUES (2, 'fund-2', '残す予算', 2026, 500000, '', 2);
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order)
      VALUES (2, 2, 'category-2', '旅費', 'travel', 1);
      INSERT INTO budget_lines (id, fund_id, category_id, amount, notes)
      VALUES (2, 2, 2, 500000, '');
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount, notes)
      VALUES (2, 2, 2, '2026-11-01', '2026-11', '残す計画', 12000, '');
      INSERT INTO actual_entries (id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes)
      VALUES (2, 2, 2, 2, '2026-11-02', '残す精算', 12000, '');
      INSERT INTO classification_tags (id, kind, name, color)
      VALUES (10, 'auxiliary', '削除確認', '#64748b');
      INSERT INTO classification_assignments (tag_id, target_type, target_id) VALUES
        (10, 'fund', 1),
        (10, 'planned_item', 1),
        (10, 'actual_entry', 1),
        (10, 'fund', 2),
        (10, 'planned_item', 2),
        (10, 'actual_entry', 2);
    `);

    const response = await app.inject({ method: "DELETE", url: "/api/funds/1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    for (const table of ["funds", "categories", "budget_lines", "planned_items", "actual_entries"]) {
      expect(
        app.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${table === "funds" ? "id" : "fund_id"} = 1`).get(),
      ).toEqual({ count: 0 });
    }
    expect(
      app.db
        .prepare(
          `
          SELECT target_type, target_id
          FROM classification_assignments
          WHERE tag_id = 10
          ORDER BY target_type
          `,
        )
        .all(),
    ).toEqual([
      { target_type: "actual_entry", target_id: 2 },
      { target_type: "fund", target_id: 2 },
      { target_type: "planned_item", target_id: 2 },
    ]);
  });

  it("returns 404 when deleting a missing fund", async () => {
    const response = await app.inject({ method: "DELETE", url: "/api/funds/999" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: "fund_not_found",
      message: "対象の予算が見つかりません。",
    });
  });

  it("creates a fund with categories and budget lines in one request", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/funds",
      payload: {
        name: "次年度予算",
        fiscalYear: 2027,
        awardedAmount: 1800000,
        notes: "",
        categories: [
          { name: "出張", amount: 700000, crossAggregateCategory: "travel" },
          { name: "消耗品", amount: 250000, crossAggregateCategory: "equipment" },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ fundId: 2 });
    expect(
      app.db
        .prepare("SELECT id, name, fiscal_year, awarded_amount, notes, display_order FROM funds WHERE id = ?")
        .get(2),
    ).toEqual({
      id: 2,
      name: "次年度予算",
      fiscal_year: 2027,
      awarded_amount: 1800000,
      notes: "",
      display_order: 2,
    });
    expect(
      app.db
        .prepare(
          "SELECT id, fund_id, name, cross_aggregate_category, display_order FROM categories WHERE fund_id = ? ORDER BY id",
        )
        .all(2),
    ).toEqual([
      { id: 2, fund_id: 2, name: "出張", cross_aggregate_category: "travel", display_order: 1 },
      { id: 3, fund_id: 2, name: "消耗品", cross_aggregate_category: "equipment", display_order: 2 },
    ]);
    expect(
      app.db
        .prepare("SELECT fund_id, category_id, amount, notes FROM budget_lines WHERE fund_id = ? ORDER BY id")
        .all(2),
    ).toEqual([
      { fund_id: 2, category_id: 2, amount: 700000, notes: "" },
      { fund_id: 2, category_id: 3, amount: 250000, notes: "" },
    ]);
  });

  it("returns 400 for an invalid cross aggregate category value", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/funds",
      payload: {
        name: "不正分類予算",
        fiscalYear: 2027,
        awardedAmount: 1000000,
        notes: "",
        categories: [{ name: "委託費", amount: 300000, crossAggregateCategory: "invalid" }],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "invalid_payload",
      message: "入力内容を確認してください。",
    });
  });

  it("returns 400 for an invalid fund creation payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/funds",
      payload: {
        name: "",
        fiscalYear: 2027,
        awardedAmount: 0,
        notes: "",
        categories: [],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "invalid_payload",
      message: "入力内容を確認してください。",
    });
  });

  it("updates a fund with edited fields and category rows", async () => {
    app.db.exec(`
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order) VALUES (2, 1, 'category-2', '旅費', 'travel', 2);
      INSERT INTO budget_lines (id, fund_id, category_id, amount, notes) VALUES (2, 1, 2, 30000, '');
    `);

    const response = await app.inject({
      method: "PUT",
      url: "/api/funds/1",
      payload: {
        name: "基盤研究費 改",
        fiscalYear: 2027,
        awardedAmount: 1500000,
        notes: "更新メモ",
        categories: [
          { id: 1, name: "設備費", amount: 900000, crossAggregateCategory: "equipment" },
          { id: 2, name: "旅費", amount: 120000, crossAggregateCategory: "travel" },
          { name: "外注費", amount: 80000, crossAggregateCategory: "other" },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(
      app.db
        .prepare("SELECT id, name, fiscal_year, awarded_amount, notes FROM funds WHERE id = ?")
        .get(1),
    ).toEqual({
      id: 1,
      name: "基盤研究費 改",
      fiscal_year: 2027,
      awarded_amount: 1500000,
      notes: "更新メモ",
    });
    expect(
      app.db
        .prepare(
          "SELECT id, fund_id, name, cross_aggregate_category, display_order FROM categories WHERE fund_id = ? ORDER BY display_order, id",
        )
        .all(1),
    ).toEqual([
      { id: 1, fund_id: 1, name: "設備費", cross_aggregate_category: "equipment", display_order: 1 },
      { id: 2, fund_id: 1, name: "旅費", cross_aggregate_category: "travel", display_order: 2 },
      { id: 3, fund_id: 1, name: "外注費", cross_aggregate_category: "other", display_order: 3 },
    ]);
    expect(
      app.db
        .prepare("SELECT category_id, amount, notes FROM budget_lines WHERE fund_id = ? ORDER BY category_id")
        .all(1),
    ).toEqual([
      { category_id: 1, amount: 900000, notes: "" },
      { category_id: 2, amount: 120000, notes: "" },
      { category_id: 3, amount: 80000, notes: "" },
    ]);
  });

  it("returns 409 when removing a category that still has planned or actual entries", async () => {
    app.db.exec(`
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order) VALUES (2, 1, 'category-2', '旅費', 'travel', 2);
      INSERT INTO budget_lines (id, fund_id, category_id, amount, notes) VALUES (2, 1, 2, 30000, '');
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount, notes) VALUES
        (2, 1, 2, '2026-11-01', '2026-11', '学会参加', 12000, '');
    `);

    const response = await app.inject({
      method: "PUT",
      url: "/api/funds/1",
      payload: {
        name: "基盤研究費",
        fiscalYear: 2026,
        awardedAmount: 1000000,
        notes: "",
        categories: [{ id: 1, name: "物品費", amount: 1000000, crossAggregateCategory: "equipment" }],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "category_has_entries",
      message: "計画項目または精算項目がある費目は削除できません。",
    });
  });

  it("returns fund-level actual entry history in reverse chronological order", async () => {
    app.db.exec(`
      INSERT INTO actual_entries (id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes) VALUES
        (2, 1, 1, NULL, '2026-10-15', '追加精算', 2000, ''),
        (3, 1, 1, NULL, '2026-09-01', '先月精算', 1500, '');
    `);

    const response = await app.inject({ method: "GET", url: "/api/funds/1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      fund: expect.objectContaining({ id: 1, name: "基盤研究費" }),
      categories: [
        expect.objectContaining({
          id: 1,
          categoryName: "物品費",
          crossAggregateCategory: "equipment",
        }),
      ],
      actualEntries: [
        {
          id: 2,
          actualDate: "2026-10-15",
          categoryName: "物品費",
          description: "追加精算",
          amount: 2000,
        },
        {
          id: 1,
          actualDate: "2026-10-05",
          categoryName: "物品費",
          description: "着手金",
          amount: 50000,
        },
        {
          id: 3,
          actualDate: "2026-09-01",
          categoryName: "物品費",
          description: "先月精算",
          amount: 1500,
        },
      ],
    });
  });
});
