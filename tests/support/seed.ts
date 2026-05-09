import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { seedDatabase } from "../../server/seeds/seedDatabase";

export type SeedProfileTables = {
  funds: unknown[];
  categories: unknown[];
  budget_lines: unknown[];
  planned_items: unknown[];
  actual_entries: unknown[];
  classification_tags: unknown[];
  classification_assignments: unknown[];
};

export function seedTestDatabase(dbPath: string) {
  return seedDatabase({
    rootDir: resolve("."),
    profile: "test",
    dbPath,
  });
}

export function createMinimalSeedProfile(overrides: Partial<SeedProfileTables> = {}): SeedProfileTables {
  return {
    funds: [
      {
        id: 1,
        fund_code: "basic-research",
        name: "基盤研究費",
        fiscal_year: 2026,
        awarded_amount: 5080000,
        notes: "",
        display_order: 1,
      },
    ],
    categories: [
      {
        id: 1,
        fund_id: 1,
        category_code: "equipment",
        name: "物品費",
        cross_aggregate_category: "equipment",
        display_order: 1,
      },
    ],
    budget_lines: [{ id: 1, fund_id: 1, category_id: 1, amount: 1400000, notes: "" }],
    planned_items: [
      {
        id: 1,
        fund_id: 1,
        category_id: 1,
        planned_ref: "basic-research-equipment-20261001-001",
        planned_date: "2026-10-01",
        scheduled_month: "2026-10",
        description: "計算サーバ",
        amount: 200000,
        status: "planned",
        notes: "",
      },
    ],
    actual_entries: [
      {
        id: 1,
        fund_id: 1,
        category_id: 1,
        planned_item_id: 1,
        actual_date: "2026-10-15",
        description: "計算サーバ",
        amount: 50000,
        notes: "",
      },
    ],
    classification_tags: [],
    classification_assignments: [],
    ...overrides,
  };
}

export function writeSeedProfile(profileDir: string, overrides: Partial<SeedProfileTables> = {}) {
  const profile = createMinimalSeedProfile(overrides);
  mkdirSync(profileDir, { recursive: true });

  for (const [tableName, rows] of Object.entries(profile)) {
    writeFileSync(join(profileDir, `${tableName}.json`), `${JSON.stringify(rows, null, 2)}\n`);
  }
}

export function writeNamedSeedProfile(
  rootDir: string,
  profileName: string,
  overrides: Partial<SeedProfileTables> = {},
) {
  writeSeedProfile(join(rootDir, "seeds", profileName), overrides);
}
