import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { buildServer } from "../../server/app";
import { loadSeedProfile } from "../../server/seeds/loadProfile";
import { seedDatabase } from "../../server/seeds/seedDatabase";
import { getFundSnapshot, getOverviewSnapshot } from "../../server/services/dashboard";
import { getFiscalYearComparisonSnapshot } from "../../server/services/fiscalYearComparison";
import { type SeedProfileTables, writeSeedProfile } from "../support/seed";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function twoFundProfile(overrides: Partial<SeedProfileTables> = {}) {
  return {
    funds: [
      { id: 1, fund_code: "fund-a", name: "基金A", fiscal_year: 2026, awarded_amount: 100, notes: "", display_order: 1 },
      { id: 2, fund_code: "fund-b", name: "基金B", fiscal_year: 2026, awarded_amount: 200, notes: "", display_order: 2 },
    ],
    categories: [
      { id: 1, fund_id: 1, category_code: "equipment", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 },
      { id: 2, fund_id: 2, category_code: "travel", name: "旅費", cross_aggregate_category: "travel", display_order: 1 },
    ],
    ...overrides,
  };
}

describe("seed profiles", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("dev profile produces meaningful overview and warning states", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-seed-dev-"));
    const dbPath = join(tempDir, "dev.db");
    tempDirs.push(tempDir);

    seedDatabase({ rootDir, profile: "dev", dbPath });

    const db = new Database(dbPath, { readonly: true });
    const overview = getOverviewSnapshot(db);
    const fund = getFundSnapshot(db, 2);

    expect(overview.totals.assets).toBe(8944296);
    expect(overview.totals.committed).toBe(1370000);
    expect(overview.totals.actual).toBe(748336);
    expect(overview.funds).toHaveLength(4);
    expect(fund.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ categoryName: "学会費", budgetAmount: 400000, plannedAmount: 500000 }),
        expect.objectContaining({ categoryName: "消耗品費", budgetAmount: null, actualAmount: 58336 }),
      ]),
    );

    db.close();

    const app = await buildServer({ dbPath });
    const response = await app.inject({
      method: "POST",
      url: "/api/planned-items",
      payload: {
        fundId: 2,
        categoryId: 3,
        plannedDate: "2026-11-01",
        scheduledMonth: "2026-11",
        description: "追加登壇費",
        amount: 10000,
        notes: "",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().warnings).toEqual(["Category budget exceeded for 学会費"]);
    await app.close();
  });

  it("demo profile loads workbook identity fields and demo totals", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-seed-demo-"));
    const dbPath = join(tempDir, "demo.db");
    tempDirs.push(tempDir);

    seedDatabase({ rootDir, profile: "demo", dbPath });

    const db = new Database(dbPath, { readonly: true });
    const overview = getOverviewSnapshot(db);
    const fundSnapshot = getFundSnapshot(db, 1);
    const plannedRefs = db.prepare("SELECT planned_ref FROM planned_items ORDER BY id").all();

    expect(overview.totals.assets).toBe(4200000);
    expect(overview.totals.actual).toBe(1210000);
    expect(overview.funds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "デモ研究費A",
          projectTags: [
            { id: 1, kind: "project", name: "量子計測基盤", color: "#2563eb" },
            { id: 2, kind: "project", name: "データ駆動解析", color: "#dc2626" },
          ],
        }),
        expect.objectContaining({
          name: "デモ研究費B",
          freeBalance: -30000,
          projectTags: [{ id: 2, kind: "project", name: "データ駆動解析", color: "#dc2626" }],
        }),
        expect.objectContaining({ name: "デモ研究費C", freeBalance: 320000, projectTags: [] }),
        expect.objectContaining({ name: "デモ研究費D", freeBalance: 30000, projectTags: [] }),
      ]),
    );
    expect(plannedRefs).toHaveLength(18);
    expect(plannedRefs).toEqual(
      expect.arrayContaining([
        { planned_ref: "demo-a-equipment-202605-001" },
        { planned_ref: "demo-a-equipment-202604-archived-001" },
        { planned_ref: "demo-d-low-balance-202610-001" },
        { planned_ref: "demo-a-travel-202607-completed-001" },
      ]),
    );
    expect(fundSnapshot.plannedItemHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "完了済み共同研究旅費",
          status: "completed",
          remainingAmount: 55000,
        }),
      ]),
    );
    expect(fundSnapshot.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryName: "消耗品費",
          budgetAmount: 200000,
          plannedAmount: 75000,
          actualAmount: 45000,
        }),
      ]),
    );
    db.close();
  });

  it("demo profile provides past, current, and future fiscal years for the initial comparison", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-seed-demo-fiscal-years-"));
    const dbPath = join(tempDir, "demo.db");
    tempDirs.push(tempDir);

    seedDatabase({ rootDir, profile: "demo", dbPath });

    const db = new Database(dbPath, { readonly: true });
    const comparison = getFiscalYearComparisonSnapshot(db, {
      today: new Date("2026-08-15T00:00:00+09:00"),
    });

    expect(comparison.fiscalYears.map((year) => [year.fiscalYear, year.state])).toEqual([
      [2027, "future"],
      [2026, "current"],
      [2025, "past"],
    ]);
    expect(comparison.fiscalYears.map((year) => year.totals.assets)).toEqual([2800000, 4200000, 1600000]);
    expect([2025, 2026, 2027].map((fiscalYear) => getOverviewSnapshot(db, { fiscalYear }).funds.length)).toEqual([2, 4, 2]);

    db.close();
  });

  it("demo profile makes past and future fiscal year edge cases observable", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-seed-demo-edge-cases-"));
    const dbPath = join(tempDir, "demo.db");
    tempDirs.push(tempDir);

    seedDatabase({ rootDir, profile: "demo", dbPath });

    const db = new Database(dbPath, { readonly: true });
    const past = getFundSnapshot(db, 5);
    const future = getFundSnapshot(db, 6);
    const comparison = getFiscalYearComparisonSnapshot(db, { today: new Date("2026-08-15T00:00:00+09:00") });

    expect(past.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ categoryName: "予備費", budgetAmount: null, actualAmount: 50000 }),
    ]));
    expect(past.plannedItemHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ description: "前年度末に中止した公開イベント", status: "cancelled" }),
    ]));
    expect(future.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ categoryName: "予備部材費", budgetAmount: 160000, plannedAmount: 180000 }),
    ]));
    expect(future.plannedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ description: "年度末試作部材", scheduledMonth: "2028-02", amount: 180000 }),
    ]));
    expect(future.actualEntries.filter((entry) => entry.description.includes("国際共同研究旅費"))).toHaveLength(2);
    expect(future.plannedItemHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ description: "翌年度に中止した共同研究会", status: "cancelled" }),
    ]));
    expect(comparison.fiscalYears[0].totals).toEqual({ assets: 2800000, committed: 1150000, actual: 150000 });
    expect(comparison.fiscalYears.at(-1)?.totals).toEqual({ assets: 1600000, committed: 0, actual: 910000 });

    db.close();
  });
  it("rejects whitespace-padded duplicate fund_code values while loading a profile", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-seed-identity-"));
    const profileDir = join(tempDir, "seeds", "dup-identity");
    tempDirs.push(tempDir);
    writeSeedProfile(profileDir, {
      funds: [
        { id: 1, fund_code: "dup-fund", name: "基金A", fiscal_year: 2026, awarded_amount: 100, notes: "", display_order: 1 },
        { id: 2, fund_code: " dup-fund ", name: "基金B", fiscal_year: 2026, awarded_amount: 200, notes: "", display_order: 2 },
      ],
    });

    expect(() => loadSeedProfile({ rootDir: tempDir, profile: "dup-identity" })).toThrow(
      /Duplicate fund_code: dup-fund/,
    );
  });

  it("rejects duplicate planned_ref values while loading a profile", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-seed-identity-"));
    const profileDir = join(tempDir, "seeds", "dup-planned-ref");
    tempDirs.push(tempDir);
    writeSeedProfile(profileDir, {
      planned_items: [
        {
          id: 1,
          fund_id: 1,
          category_id: 1,
          planned_ref: "dup-ref",
          planned_date: "2026-05-01",
          scheduled_month: "2026-05",
          description: "予定A",
          amount: 10,
          status: "planned",
          notes: "",
        },
        {
          id: 2,
          fund_id: 1,
          category_id: 1,
          planned_ref: "dup-ref",
          planned_date: "2026-05-02",
          scheduled_month: "2026-05",
          description: "予定B",
          amount: 20,
          status: "planned",
          notes: "",
        },
      ],
    });

    expect(() => loadSeedProfile({ rootDir: tempDir, profile: "dup-planned-ref" })).toThrow(
      /Duplicate planned_ref: dup-ref/,
    );
  });

  it("rejects whitespace-padded duplicate category identity values while loading a profile", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-seed-category-dup-"));
    const profileDir = join(tempDir, "seeds", "dup-category");
    tempDirs.push(tempDir);
    writeSeedProfile(profileDir, {
      categories: [
        { id: 1, fund_id: 1, category_code: "equipment", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 },
        { id: 2, fund_id: 1, category_code: " equipment ", name: "物品費2", cross_aggregate_category: "equipment", display_order: 2 },
      ],
    });

    expect(() => loadSeedProfile({ rootDir: tempDir, profile: "dup-category" })).toThrow(
      /Duplicate category identity 1:equipment in categories\.json/,
    );
  });

  it.each([
    {
      name: "budget_lines",
      profile: "mismatch-budget",
      expectedError: /budget_lines\.json 1 category_id 2 belongs to fund_id 2, expected 1/,
      build: () => twoFundProfile({
        budget_lines: [{ id: 1, fund_id: 1, category_id: 2, amount: null, notes: "" }],
      }),
    },
    {
      name: "planned_items",
      profile: "mismatch-planned",
      expectedError: /planned_items\.json 1 category_id 2 belongs to fund_id 2, expected 1/,
      build: () => twoFundProfile({
        planned_items: [
          {
            id: 1,
            fund_id: 1,
            category_id: 2,
            planned_ref: "fund-a-travel-001",
            planned_date: "2026-05-01",
            scheduled_month: "2026-05",
            description: "予定A",
            amount: 10,
            status: "planned",
            notes: "",
          },
        ],
      }),
    },
    {
      name: "actual_entries",
      profile: "mismatch-actual",
      expectedError: /actual_entries\.json 1 category_id 2 belongs to fund_id 2, expected 1/,
      build: () => twoFundProfile({
        actual_entries: [{ id: 1, fund_id: 1, category_id: 2, planned_item_id: null, actual_date: "2026-05-03", description: "実績", amount: 5, notes: "" }],
      }),
    },
  ])("rejects category/fund mismatches in $name", ({ profile, expectedError, build }) => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-seed-identity-"));
    const profileDir = join(tempDir, "seeds", profile);
    tempDirs.push(tempDir);
    writeSeedProfile(profileDir, build());

    expect(() => loadSeedProfile({ rootDir: tempDir, profile })).toThrow(expectedError);
  });

  it("rejects actual entries whose planned item points to a different fund/category", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-seed-actual-plan-"));
    const profileDir = join(tempDir, "seeds", "actual-plan-mismatch");
    tempDirs.push(tempDir);
    writeSeedProfile(profileDir, twoFundProfile({
      actual_entries: [{ id: 1, fund_id: 2, category_id: 2, planned_item_id: 1, actual_date: "2026-05-03", description: "実績", amount: 5, notes: "" }],
    }));

    expect(() => loadSeedProfile({ rootDir: tempDir, profile: "actual-plan-mismatch" })).toThrow(
      /actual_entries\.json 1 planned_item_id 1 belongs to fund_id 1\/category_id 1, expected 2\/2/,
    );
  });

  it("test profile stays small and deterministic for export consumers", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-seed-test-"));
    const dbPath = join(tempDir, "test.db");
    tempDirs.push(tempDir);

    seedDatabase({ rootDir, profile: "test", dbPath });
    const db = new Database(dbPath, { readonly: true });

    expect(db.prepare("SELECT COUNT(*) AS count FROM funds").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM categories").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM budget_lines").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM planned_items").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM actual_entries").get()).toEqual({ count: 1 });

    db.close();
  });
});
