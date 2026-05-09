import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { seedDatabase } from "../../server/seeds/seedDatabase";

function writeProfile(rootDir: string) {
  const profileDir = join(rootDir, "seeds", "test");
  mkdirSync(profileDir, { recursive: true });

  writeFileSync(
    join(profileDir, "funds.json"),
    JSON.stringify([{ id: 1, name: "基盤研究費", fiscal_year: 2026, awarded_amount: 5080000, notes: "", display_order: 1 }], null, 2),
  );
  writeFileSync(
    join(profileDir, "categories.json"),
    JSON.stringify([{ id: 1, fund_id: 1, name: "物品費", cross_aggregate_category: "equipment", display_order: 1 }], null, 2),
  );
  writeFileSync(
    join(profileDir, "budget_lines.json"),
    JSON.stringify([{ id: 1, fund_id: 1, category_id: 1, amount: 1400000, notes: "" }], null, 2),
  );
  writeFileSync(
    join(profileDir, "planned_items.json"),
    JSON.stringify(
      [
        {
          id: 1,
          fund_id: 1,
          category_id: 1,
          planned_date: "2026-10-01",
          scheduled_month: "2026-10",
          description: "計算サーバ",
          amount: 200000,
          status: "planned",
          notes: "",
        },
      ],
      null,
      2,
    ),
  );
  writeFileSync(join(profileDir, "actual_entries.json"), JSON.stringify([], null, 2));
}

describe("seedDatabase", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("recreates the sqlite database deterministically and returns row counts", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-seed-runner-"));
    const dbPath = join(rootDir, "app.db");
    tempDirs.push(rootDir);
    writeProfile(rootDir);

    const first = seedDatabase({ rootDir, profile: "test", dbPath });
    let db = new Database(dbPath, { readonly: true });
    expect(db.prepare("SELECT id, name, fiscal_year, awarded_amount, notes, display_order FROM funds").all()).toEqual([
      { id: 1, name: "基盤研究費", fiscal_year: 2026, awarded_amount: 5080000, notes: "", display_order: 1 },
    ]);
    expect(db.prepare("SELECT id, fund_id, name, cross_aggregate_category, display_order FROM categories").all()).toEqual([
      { id: 1, fund_id: 1, name: "物品費", cross_aggregate_category: "equipment", display_order: 1 },
    ]);
    expect(db.prepare("SELECT id, fund_id, category_id, amount, notes FROM budget_lines").all()).toEqual([
      { id: 1, fund_id: 1, category_id: 1, amount: 1400000, notes: "" },
    ]);
    expect(
      db.prepare(
        "SELECT id, fund_id, category_id, planned_date, scheduled_month, description, amount, status, notes FROM planned_items",
      ).all(),
    ).toEqual([
      {
        id: 1,
        fund_id: 1,
        category_id: 1,
        planned_date: "2026-10-01",
        scheduled_month: "2026-10",
        description: "計算サーバ",
        amount: 200000,
        status: "planned",
        notes: "",
      },
    ]);
    expect(db.prepare("SELECT id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes FROM actual_entries").all()).toEqual([]);
    db.close();

    const writableDb = new Database(dbPath);
    writableDb.exec(`INSERT INTO funds (id, name, fiscal_year, awarded_amount, notes, display_order) VALUES (99, '余計な行', 2026, 1, '', 99)`);
    writableDb.close();

    const second = seedDatabase({ rootDir, profile: "test", dbPath });
    db = new Database(dbPath, { readonly: true });
    expect(db.prepare("SELECT COUNT(*) AS count FROM funds").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT id FROM funds ORDER BY id").all()).toEqual([{ id: 1 }]);
    expect(first).toEqual({
      profile: "test",
      dbPath,
      counts: { funds: 1, categories: 1, budget_lines: 1, planned_items: 1, actual_entries: 0 },
    });
    expect(second.counts.planned_items).toBe(1);
    db.close();
  });

  it("uses a separate default database path for the test seed CLI", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-seed-cli-"));
    tempDirs.push(rootDir);
    writeProfile(rootDir);

    const tsxBin = join(process.cwd(), "node_modules", ".bin", "tsx");
    const env = { ...process.env };
    delete env.BUDGET_DB_PATH;
    execFileSync(tsxBin, [join(process.cwd(), "scripts", "seed.ts"), "test"], {
      cwd: rootDir,
      env,
      stdio: "pipe",
    });

    expect(existsSync(join(rootDir, "app.db"))).toBe(false);

    const db = new Database(join(rootDir, "app.test.db"), { readonly: true });
    expect(db.prepare("SELECT COUNT(*) AS count FROM funds").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM categories").get()).toEqual({ count: 1 });
    db.close();
  });

  it("seeds the demo profile through the CLI with import history and workbook copy", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-seed-demo-cli-"));
    tempDirs.push(rootDir);
    cpSync(join(process.cwd(), "seeds", "demo"), join(rootDir, "seeds", "demo"), { recursive: true });

    const tsxBin = join(process.cwd(), "node_modules", ".bin", "tsx");
    const env = { ...process.env };
    delete env.BUDGET_DB_PATH;
    execFileSync(tsxBin, [join(process.cwd(), "scripts", "seed.ts"), "demo"], {
      cwd: rootDir,
      env,
      stdio: "pipe",
    });

    const dbPath = join(rootDir, "app.db");
    expect(existsSync(dbPath)).toBe(true);

    const db = new Database(dbPath, { readonly: true });
    const importRow = db
      .prepare(
        `
        SELECT workbook_path
        FROM imports
        ORDER BY imported_at DESC, id DESC
        LIMIT 1
        `,
      )
      .get() as { workbook_path: string };
    expect(existsSync(importRow.workbook_path)).toBe(true);
    db.close();
  }, 10_000);
});
