import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSeedProfile } from "../../server/seeds/loadProfile";

function baseProfile() {
  return {
    "funds.json": [{ id: 1, fund_code: "basic-research", name: "基盤研究費", fiscal_year: 2026, awarded_amount: 5080000, notes: "", display_order: 1 }],
    "categories.json": [{ id: 1, fund_id: 1, category_code: "equipment", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 }],
    "budget_lines.json": [{ id: 1, fund_id: 1, category_id: 1, amount: 1400000, notes: "" }],
    "planned_items.json": [{ id: 1, fund_id: 1, category_id: 1, planned_ref: "basic-research-equipment-20261001-001", planned_date: "2026-10-01", scheduled_month: "2026-10", description: "計算サーバ", amount: 200000, status: "planned", notes: "" }],
    "actual_entries.json": [{ id: 1, fund_id: 1, category_id: 1, planned_item_id: 1, actual_date: "2026-10-15", description: "計算サーバ", amount: 50000, notes: "" }],
    "classification_tags.json": [],
    "classification_assignments.json": [],
  };
}

function writeProfile(rootDir: string, profile: string, files: Record<string, unknown>) {
  const profileDir = join(rootDir, "seeds", profile);
  mkdirSync(profileDir, { recursive: true });

  for (const [filename, data] of Object.entries(files)) {
    writeFileSync(join(profileDir, filename), JSON.stringify(data, null, 2));
  }
}

describe("loadSeedProfile", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("loads a valid profile with normalized tables", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-seed-loader-"));
    tempDirs.push(rootDir);

    writeProfile(rootDir, "test", baseProfile());

    const profile = loadSeedProfile({ rootDir, profile: "test" });

    expect(profile.funds).toHaveLength(1);
    expect(profile.categories[0]).toMatchObject({ id: 1, fund_id: 1, name: "物品費" });
    expect(profile.actual_entries[0]).toMatchObject({ planned_item_id: 1, amount: 50000 });
  });

  it("rejects rows with unexpected columns", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-seed-loader-"));
    tempDirs.push(rootDir);

    const profile: Record<string, unknown> = {
      ...baseProfile(),
      "funds.json": [
        {
          id: 1,
          name: "基盤研究費",
          fiscal_year: 2026,
          awarded_amount: 5080000,
          notes: "",
          display_order: 1,
          unexpected: "extra",
        },
      ],
    };
    writeProfile(rootDir, "test", profile);

    expect(() => loadSeedProfile({ rootDir, profile: "test" })).toThrow(/Unrecognized key\(s\) in object: 'unexpected'/);
  });

  it("rejects duplicate ids within a table file", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-seed-loader-"));
    tempDirs.push(rootDir);

    const profile = baseProfile();
    profile["funds.json"] = [
      { id: 1, fund_code: "basic-research", name: "基盤研究費", fiscal_year: 2026, awarded_amount: 5080000, notes: "", display_order: 1 },
      { id: 1, fund_code: "education", name: "教育研究費", fiscal_year: 2026, awarded_amount: 1221296, notes: "", display_order: 2 },
    ];
    profile["categories.json"] = [];
    profile["budget_lines.json"] = [];
    profile["planned_items.json"] = [];
    profile["actual_entries.json"] = [];
    writeProfile(rootDir, "test", profile);

    expect(() => loadSeedProfile({ rootDir, profile: "test" })).toThrow("Duplicate id 1 in funds.json");
  });

  it("rejects foreign-key references that are missing from the same profile", () => {
    const cases: Array<{
      message: string;
      mutate: (profile: ReturnType<typeof baseProfile>) => void;
    }> = [
      {
        message: "categories.json references missing fund_id 99",
        mutate: (profile) => {
          profile["categories.json"] = [{ id: 1, fund_id: 99, category_code: "equipment", name: "物品費", cross_aggregate_category: "equipment", display_order: 1 }];
          profile["budget_lines.json"] = [];
          profile["planned_items.json"] = [];
          profile["actual_entries.json"] = [];
        },
      },
      {
        message: "budget_lines.json references missing fund_id 99",
        mutate: (profile) => {
          profile["budget_lines.json"] = [{ id: 1, fund_id: 99, category_id: 1, amount: 1400000, notes: "" }];
          profile["planned_items.json"] = [];
          profile["actual_entries.json"] = [];
        },
      },
      {
        message: "budget_lines.json references missing category_id 99",
        mutate: (profile) => {
          profile["budget_lines.json"] = [{ id: 1, fund_id: 1, category_id: 99, amount: 1400000, notes: "" }];
          profile["planned_items.json"] = [];
          profile["actual_entries.json"] = [];
        },
      },
      {
        message: "planned_items.json references missing fund_id 99",
        mutate: (profile) => {
          profile["budget_lines.json"] = [];
          profile["planned_items.json"] = [{ id: 1, fund_id: 99, category_id: 1, planned_ref: "basic-research-equipment-20261001-001", planned_date: "2026-10-01", scheduled_month: "2026-10", description: "計算サーバ", amount: 200000, status: "planned", notes: "" }];
          profile["actual_entries.json"] = [];
        },
      },
      {
        message: "planned_items.json references missing category_id 99",
        mutate: (profile) => {
          profile["budget_lines.json"] = [];
          profile["planned_items.json"] = [{ id: 1, fund_id: 1, category_id: 99, planned_ref: "basic-research-equipment-20261001-001", planned_date: "2026-10-01", scheduled_month: "2026-10", description: "計算サーバ", amount: 200000, status: "planned", notes: "" }];
          profile["actual_entries.json"] = [];
        },
      },
      {
        message: "actual_entries.json references missing fund_id 99",
        mutate: (profile) => {
          profile["budget_lines.json"] = [];
          profile["actual_entries.json"] = [{ id: 1, fund_id: 99, category_id: 1, planned_item_id: 1, actual_date: "2026-10-15", description: "計算サーバ", amount: 50000, notes: "" }];
        },
      },
      {
        message: "actual_entries.json references missing category_id 99",
        mutate: (profile) => {
          profile["budget_lines.json"] = [];
          profile["actual_entries.json"] = [{ id: 1, fund_id: 1, category_id: 99, planned_item_id: 1, actual_date: "2026-10-15", description: "計算サーバ", amount: 50000, notes: "" }];
        },
      },
      {
        message: "actual_entries.json references missing planned_item_id 99",
        mutate: (profile) => {
          profile["budget_lines.json"] = [];
          profile["actual_entries.json"] = [{ id: 1, fund_id: 1, category_id: 1, planned_item_id: 99, actual_date: "2026-10-15", description: "計算サーバ", amount: 50000, notes: "" }];
        },
      },
    ];

    for (const { message, mutate } of cases) {
      const rootDir = mkdtempSync(join(tmpdir(), "budget-seed-loader-"));
      tempDirs.push(rootDir);
      const profile = baseProfile();
      mutate(profile);
      writeProfile(rootDir, "test", profile);

      expect(() => loadSeedProfile({ rootDir, profile: "test" })).toThrow(message);
    }
  });
});
