import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../../server/app";

async function createEmptyServer(dbPath: string) {
  rmSync(dbPath, { force: true });
  const app = await buildServer({ dbPath, seedDefaultClassifications: false });

  return {
    app,
    async cleanup() {
      await app.close();
      rmSync(dbPath, { force: true });
      rmSync(`${dbPath}.uploads`, { recursive: true, force: true });
    },
  };
}

describe("header alerts route", () => {
  const contexts: Array<{ cleanup: () => Promise<void> }> = [];

  afterEach(async () => {
    while (contexts.length > 0) {
      await contexts.pop()?.cleanup();
    }
  });

  it("returns primary and supporting alerts for the selected fiscal year", async () => {
    const context = await createEmptyServer("test-header-alerts.db");
    contexts.push(context);

    context.app.db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES
        (1, '基盤研究費', 2026, 100000, 1),
        (2, '翌年度基金', 2027, 1000000, 2);

      INSERT INTO categories (id, fund_id, name, cross_aggregate_category, display_order) VALUES
        (1, 1, '物品費', 'equipment', 1),
        (2, 1, '旅費', 'travel', 2),
        (3, 2, '物品費', 'equipment', 1);

      INSERT INTO budget_lines (id, fund_id, category_id, amount) VALUES
        (1, 1, 1, 50000),
        (2, 1, 2, 50000),
        (3, 2, 3, 1000000);

      INSERT INTO planned_items (
        id, fund_id, category_id, planned_date, scheduled_month, description, amount, status
      ) VALUES
        (1, 1, 1, '2026-04-01', '2026-04', 'GPU サーバ購入', 70000, 'planned'),
        (3, 1, 2, '2026-06-01', '2026-06', '国内出張', 20000, 'planned'),
        (2, 2, 3, '2027-04-01', '2027-04', '翌年度サーバ', 900000, 'planned');

      INSERT INTO actual_entries (
        id, fund_id, category_id, planned_item_id, actual_date, description, amount
      ) VALUES
        (1, 1, 1, NULL, '2026-04-15', '書籍', 10000),
        (2, 1, 2, NULL, '2026-04-20', '参加費', 30000),
        (3, 2, 3, NULL, '2027-04-20', '翌年度実績', 800000);

      INSERT INTO imports (
        id,
        source_filename,
        imported_at,
        warning_count,
        mapping_summary,
        warnings_json,
        reconciliation_json
      ) VALUES
        (
          1,
          'budget2026.xlsx',
          '2026-04-20T12:00:00.000Z',
          3,
          '{"mode":"replace","counts":{"funds":1,"categories":2,"budget_lines":2,"planned_items":1,"actual_entries":2,"warnings":3},"warning_count_by_code":{"unlinked_actual_entry":3}}',
          '[]',
          '{"ok":false,"workbook_path":"/tmp/budget2026.xlsx","db_path":"/tmp/app.db","overall":{"expected":{"assets":100000,"planned":70000,"actual":40000,"free_balance":-10000},"actual":{"assets":100000,"planned":70000,"actual":40000,"free_balance":-10000}},"funds":[],"mismatches":[{"scope":"overall","metric":"actual","expected":30000,"actual":40000,"delta":10000}]}'
        );
    `);

    const response = await context.app.inject({
      method: "GET",
      url: "/api/header-alerts?year=2026",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      selectedFiscalYear: 2026,
      primary: [
        {
          key: "budget_overrun",
          label: "予算超過",
          severity: "danger",
          count: 1,
          items: [
            {
              title: "基盤研究費",
              href: "/funds/1?year=2026",
              details: [
                {
                  label: "物品費",
                  labelTone: "budget_overrun",
                  amount: -30000,
                },
              ],
            },
          ],
        },
        {
          key: "reconciliation_mismatch",
          label: "不整合",
          severity: "danger",
          count: 1,
          items: [
            {
              title: "budget2026.xlsx",
              href: "/imports/1",
            },
          ],
        },
        {
          key: "overdue",
          label: "期限超過",
          severity: "warning",
          count: 1,
          items: [
            {
              title: "基盤研究費",
              href: "/funds/1?year=2026",
              details: [
                {
                  label: "2026-04",
                  labelTone: "overdue",
                  title: "GPU サーバ購入",
                  amount: 70000,
                },
              ],
            },
          ],
        },
        {
          key: "year_end_risk",
          label: "年度末注意",
          severity: "warning",
          count: 1,
          items: [
            {
              title: "基盤研究費",
              href: "/funds/1?year=2026",
              yearEndRisks: [
                {
                  kind: "negative_balance",
                  label: "残高不足",
                  amount: -30000,
                  rate: -30,
                },
                {
                  kind: "overdue_planned",
                  label: "期限超過予定",
                  amount: 70000,
                },
              ],
            },
          ],
        },
      ],
      supporting: [
        {
          key: "import_warning",
          label: "import warning",
          severity: "supporting",
          count: 3,
          items: [
            {
              title: "budget2026.xlsx",
              href: "/imports/1",
            },
          ],
        },
      ],
    });
    expect(body.primary.find((category: { key: string }) => category.key === "budget_overrun")?.description)
      .toBeUndefined();
    expect(body.primary.find((category: { key: string }) => category.key === "year_end_risk")?.description)
      .toBeUndefined();
  });

  it("returns no primary categories when there are no alerts", async () => {
    const context = await createEmptyServer("test-header-alerts-empty.db");
    contexts.push(context);

    context.app.db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES
        (1, '基盤研究費', 2026, 100000, 1);

      INSERT INTO categories (id, fund_id, name, cross_aggregate_category, display_order) VALUES
        (1, 1, '物品費', 'equipment', 1);

      INSERT INTO budget_lines (id, fund_id, category_id, amount) VALUES
        (1, 1, 1, 100000);

      INSERT INTO planned_items (
        id, fund_id, category_id, planned_date, scheduled_month, description, amount, status
      ) VALUES
        (1, 1, 1, '2026-04-01', '2026-04', '支払済み装置', 80000, 'cancelled');

      INSERT INTO actual_entries (
        id, fund_id, category_id, planned_item_id, actual_date, description, amount
      ) VALUES
        (1, 1, 1, 1, '2026-04-10', '支払済み装置', 80000);
    `);

    const response = await context.app.inject({
      method: "GET",
      url: "/api/header-alerts?year=2026",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      selectedFiscalYear: 2026,
      primary: [],
      supporting: [],
    });
  });
});
