import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { buildServer } from "../../server/app";
import { loadSeedProfile } from "../../server/seeds/loadProfile";
import { seedDatabase } from "../../server/seeds/seedDatabase";
import { getFundSnapshot, getOverviewSnapshot } from "../../server/services/dashboard";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeSeedProfile(profileDir: string, data: {
  funds: unknown[];
  categories: unknown[];
  budget_lines: unknown[];
  planned_items: unknown[];
  actual_entries: unknown[];
}) {
  mkdirSync(profileDir, { recursive: true });
  writeJsonFile(join(profileDir, "funds.json"), data.funds);
  writeJsonFile(join(profileDir, "categories.json"), data.categories);
  writeJsonFile(join(profileDir, "budget_lines.json"), data.budget_lines);
  writeJsonFile(join(profileDir, "planned_items.json"), data.planned_items);
  writeJsonFile(join(profileDir, "actual_entries.json"), data.actual_entries);
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
    const plannedItemRows = db.prepare("SELECT id, planned_ref FROM planned_items ORDER BY id").all();

    expect(overview.totals.assets).toBe(4200000);
    expect(overview.totals.actual).toBe(1085000);
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
    expect(plannedItemRows).toEqual([
      { id: 1, planned_ref: "demo-a-equipment-202605-001" },
      { id: 2, planned_ref: "demo-a-travel-202607-001" },
      { id: 3, planned_ref: "demo-a-supplies-202608-001" },
      { id: 4, planned_ref: "demo-b-outsourcing-202604-001" },
      { id: 5, planned_ref: "demo-b-outsourcing-202609-001" },
      { id: 6, planned_ref: "demo-c-personnel-202606-001" },
      { id: 7, planned_ref: "demo-a-equipment-202604-archived-001" },
      { id: 8, planned_ref: "demo-a-travel-202606-archived-001" },
      { id: 9, planned_ref: "demo-d-low-balance-202610-001" },
    ]);
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

  it("canonicalizes blank workbook identities to null while loading a profile", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-seed-whitespace-"));
    const profileDir = join(tempDir, "seeds", "whitespace");
    tempDirs.push(tempDir);
    writeSeedProfile(profileDir, {
      funds: [
        { id: 1, fund_code: "", name: "基金A", fiscal_year: 2026, awarded_amount: 100, notes: "", display_order: 1 },
      ],
      categories: [
        { id: 1, fund_id: 1, category_code: "", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 },
      ],
      budget_lines: [{ id: 1, fund_id: 1, category_id: 1, amount: null, notes: "" }],
      planned_items: [
        {
          id: 1,
          fund_id: 1,
          category_id: 1,
          planned_ref: "",
          planned_date: "2026-05-01",
          scheduled_month: "2026-05",
          description: "予定A",
          amount: 10,
          status: "planned",
          notes: "",
        },
      ],
      actual_entries: [{ id: 1, fund_id: 1, category_id: 1, planned_item_id: null, actual_date: "2026-05-03", description: "実績", amount: 5, notes: "" }],
    });

    const data = loadSeedProfile({ rootDir: tempDir, profile: "whitespace" });

    expect(data.funds).toEqual([
      expect.objectContaining({ fund_code: null }),
    ]);
    expect(data.categories).toEqual([
      expect.objectContaining({ category_code: null }),
    ]);
    expect(data.planned_items).toEqual([
      expect.objectContaining({ planned_ref: null }),
    ]);
  });

  it("backfills referenced blank planned_ref values while loading a profile", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-seed-backfill-"));
    const profileDir = join(tempDir, "seeds", "backfill");
    tempDirs.push(tempDir);
    writeSeedProfile(profileDir, {
      funds: [{ id: 1, fund_code: "fund-a", name: "基金A", fiscal_year: 2026, awarded_amount: 100, notes: "", display_order: 1 }],
      categories: [{ id: 1, fund_id: 1, category_code: "equipment", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 }],
      budget_lines: [{ id: 1, fund_id: 1, category_id: 1, amount: null, notes: "" }],
      planned_items: [
        {
          id: 1,
          fund_id: 1,
          category_id: 1,
          planned_ref: "",
          planned_date: "2026-05-01",
          scheduled_month: "2026-05",
          description: "予定A",
          amount: 10,
          status: "planned",
          notes: "",
        },
      ],
      actual_entries: [{ id: 1, fund_id: 1, category_id: 1, planned_item_id: 1, actual_date: "2026-05-03", description: "実績", amount: 5, notes: "" }],
    });

    const data = loadSeedProfile({ rootDir: tempDir, profile: "backfill" });

    expect(data.planned_items).toEqual([
      expect.objectContaining({ planned_ref: "planned-1" }),
    ]);
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
      categories: [{ id: 1, fund_id: 1, category_code: "equipment", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 }],
      budget_lines: [{ id: 1, fund_id: 1, category_id: 1, amount: null, notes: "" }],
      planned_items: [
        {
          id: 1,
          fund_id: 1,
          category_id: 1,
          planned_ref: "dup-ref-a",
          planned_date: "2026-05-01",
          scheduled_month: "2026-05",
          description: "予定A",
          amount: 10,
          status: "planned",
          notes: "",
        },
      ],
      actual_entries: [{ id: 1, fund_id: 1, category_id: 1, planned_item_id: 1, actual_date: "2026-05-03", description: "実績", amount: 5, notes: "" }],
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
      funds: [{ id: 1, fund_code: "fund-a", name: "基金A", fiscal_year: 2026, awarded_amount: 100, notes: "", display_order: 1 }],
      categories: [{ id: 1, fund_id: 1, category_code: "equipment", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 }],
      budget_lines: [{ id: 1, fund_id: 1, category_id: 1, amount: null, notes: "" }],
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
      actual_entries: [{ id: 1, fund_id: 1, category_id: 1, planned_item_id: 1, actual_date: "2026-05-03", description: "実績", amount: 5, notes: "" }],
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
      funds: [{ id: 1, fund_code: "fund-a", name: "基金A", fiscal_year: 2026, awarded_amount: 100, notes: "", display_order: 1 }],
      categories: [
        { id: 1, fund_id: 1, category_code: "equipment", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 },
        { id: 2, fund_id: 1, category_code: " equipment ", name: "物品費2", cross_aggregate_category: "equipment", display_order: 2 },
      ],
      budget_lines: [{ id: 1, fund_id: 1, category_id: 1, amount: null, notes: "" }],
      planned_items: [
        {
          id: 1,
          fund_id: 1,
          category_id: 1,
          planned_ref: "fund-a-equipment-001",
          planned_date: "2026-05-01",
          scheduled_month: "2026-05",
          description: "予定A",
          amount: 10,
          status: "planned",
          notes: "",
        },
      ],
      actual_entries: [{ id: 1, fund_id: 1, category_id: 1, planned_item_id: 1, actual_date: "2026-05-03", description: "実績", amount: 5, notes: "" }],
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
      build: () => ({
        funds: [
          { id: 1, fund_code: "fund-a", name: "基金A", fiscal_year: 2026, awarded_amount: 100, notes: "", display_order: 1 },
          { id: 2, fund_code: "fund-b", name: "基金B", fiscal_year: 2026, awarded_amount: 200, notes: "", display_order: 2 },
        ],
        categories: [
          { id: 1, fund_id: 1, category_code: "equipment", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 },
          { id: 2, fund_id: 2, category_code: "travel", name: "旅費", cross_aggregate_category: "travel", display_order: 1 },
        ],
        budget_lines: [{ id: 1, fund_id: 1, category_id: 2, amount: null, notes: "" }],
        planned_items: [
          {
            id: 1,
            fund_id: 1,
            category_id: 1,
            planned_ref: "fund-a-equipment-001",
            planned_date: "2026-05-01",
            scheduled_month: "2026-05",
            description: "予定A",
            amount: 10,
            status: "planned",
            notes: "",
          },
        ],
        actual_entries: [{ id: 1, fund_id: 1, category_id: 1, planned_item_id: 1, actual_date: "2026-05-03", description: "実績", amount: 5, notes: "" }],
      }),
    },
    {
      name: "planned_items",
      profile: "mismatch-planned",
      expectedError: /planned_items\.json 1 category_id 2 belongs to fund_id 2, expected 1/,
      build: () => ({
        funds: [
          { id: 1, fund_code: "fund-a", name: "基金A", fiscal_year: 2026, awarded_amount: 100, notes: "", display_order: 1 },
          { id: 2, fund_code: "fund-b", name: "基金B", fiscal_year: 2026, awarded_amount: 200, notes: "", display_order: 2 },
        ],
        categories: [
          { id: 1, fund_id: 1, category_code: "equipment", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 },
          { id: 2, fund_id: 2, category_code: "travel", name: "旅費", cross_aggregate_category: "travel", display_order: 1 },
        ],
        budget_lines: [{ id: 1, fund_id: 1, category_id: 1, amount: null, notes: "" }],
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
        actual_entries: [{ id: 1, fund_id: 1, category_id: 1, planned_item_id: 1, actual_date: "2026-05-03", description: "実績", amount: 5, notes: "" }],
      }),
    },
    {
      name: "actual_entries",
      profile: "mismatch-actual",
      expectedError: /actual_entries\.json 1 category_id 2 belongs to fund_id 2, expected 1/,
      build: () => ({
        funds: [
          { id: 1, fund_code: "fund-a", name: "基金A", fiscal_year: 2026, awarded_amount: 100, notes: "", display_order: 1 },
          { id: 2, fund_code: "fund-b", name: "基金B", fiscal_year: 2026, awarded_amount: 200, notes: "", display_order: 2 },
        ],
        categories: [
          { id: 1, fund_id: 1, category_code: "equipment", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 },
          { id: 2, fund_id: 2, category_code: "travel", name: "旅費", cross_aggregate_category: "travel", display_order: 1 },
        ],
        budget_lines: [{ id: 1, fund_id: 1, category_id: 1, amount: null, notes: "" }],
        planned_items: [
          {
            id: 1,
            fund_id: 1,
            category_id: 1,
            planned_ref: "fund-a-equipment-001",
            planned_date: "2026-05-01",
            scheduled_month: "2026-05",
            description: "予定A",
            amount: 10,
            status: "planned",
            notes: "",
          },
        ],
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
    writeSeedProfile(profileDir, {
      funds: [
        { id: 1, fund_code: "fund-a", name: "基金A", fiscal_year: 2026, awarded_amount: 100, notes: "", display_order: 1 },
        { id: 2, fund_code: "fund-b", name: "基金B", fiscal_year: 2026, awarded_amount: 200, notes: "", display_order: 2 },
      ],
      categories: [
        { id: 1, fund_id: 1, category_code: "equipment", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 },
        { id: 2, fund_id: 2, category_code: "travel", name: "旅費", cross_aggregate_category: "travel", display_order: 1 },
      ],
      budget_lines: [{ id: 1, fund_id: 1, category_id: 1, amount: null, notes: "" }],
      planned_items: [
        {
          id: 1,
          fund_id: 1,
          category_id: 1,
          planned_ref: "fund-a-equipment-001",
          planned_date: "2026-05-01",
          scheduled_month: "2026-05",
          description: "予定A",
          amount: 10,
          status: "planned",
          notes: "",
        },
      ],
      actual_entries: [{ id: 1, fund_id: 2, category_id: 2, planned_item_id: 1, actual_date: "2026-05-03", description: "実績", amount: 5, notes: "" }],
    });

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
