import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../../server/app";

describe("fiscal year comparison route", () => {
  const apps: Array<Awaited<ReturnType<typeof buildServer>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("returns all fiscal years using the server clock for state classification", async () => {
    const app = await buildServer({
      dbPath: ":memory:",
      seedDefaultClassifications: false,
      now: () => new Date("2026-08-15T00:00:00+09:00"),
    });
    apps.push(app);
    app.db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES
        (1, '進行年度', 2026, 1000000, 1),
        (2, '未来年度', 2027, 2000000, 2);
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order) VALUES
        (1, 1, 'current-equipment', '物品費', 'equipment', 1),
        (2, 2, 'future-travel', '旅費', 'travel', 1);
    `);

    const response = await app.inject({
      method: "GET",
      url: "/api/fiscal-year-comparison",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      currentFiscalYear: 2026,
      fiscalYears: [
        { fiscalYear: 2027, state: "future", totals: { assets: 2000000 } },
        { fiscalYear: 2026, state: "current", totals: { assets: 1000000 } },
      ],
    });
  });

});
