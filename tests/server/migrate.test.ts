import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../../server/db/migrate";

function legacyDb(rows: string) {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE funds (
      id INTEGER PRIMARY KEY,
      fund_code TEXT,
      name TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      awarded_amount INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      display_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY,
      fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      category_code TEXT,
      name TEXT NOT NULL,
      cross_aggregate_category TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO funds (id, name, fiscal_year, awarded_amount) VALUES
      (1, 'A', 2026, 1000), (2, 'B', 2026, 1000);
    ${rows}
  `);
  return db;
}

describe("category code migration", () => {
  it("backfills null and blank legacy codes and is idempotent", () => {
    const db = legacyDb(`
      INSERT INTO categories VALUES
        (1, 1, NULL, 'a', 'other', 1),
        (2, 1, '', 'b', 'other', 2),
        (3, 1, '   ', 'c', 'other', 3);
    `);

    runMigrations(db);
    runMigrations(db);

    expect(db.prepare("SELECT id, category_code FROM categories ORDER BY id").all()).toEqual([
      { id: 1, category_code: "category-1" },
      { id: 2, category_code: "category-2" },
      { id: 3, category_code: "category-3" },
    ]);
  });

  it.each([
    ["surrounding whitespace", "(1, 1, ' code ', 'a', 'other', 1)"],
    ["duplicate codes in one fund", "(1, 1, 'code', 'a', 'other', 1), (2, 1, 'code', 'b', 'other', 2)"],
  ])("rejects %s atomically", (_label, values) => {
    const db = legacyDb(`INSERT INTO categories VALUES ${values};`);
    expect(() => runMigrations(db)).toThrow();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'categories_fund_category_code_unique'").get()).toBeUndefined();
  });

  it("allows the same code in different funds", () => {
    const db = legacyDb(`
      INSERT INTO categories VALUES
        (1, 1, 'code', 'a', 'other', 1),
        (2, 2, 'code', 'b', 'other', 1);
    `);
    expect(() => runMigrations(db)).not.toThrow();
  });

  it.each([null, "", " ", " code "])("rejects invalid category code %j on insert and update", (code) => {
    const db = new Database(":memory:");
    runMigrations(db);
    db.prepare("INSERT INTO funds (id, name, fiscal_year, awarded_amount) VALUES (1, 'A', 2026, 1000)").run();
    expect(() =>
      db.prepare("INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category) VALUES (1, 1, ?, 'a', 'other')").run(code),
    ).toThrow();
    db.prepare("INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category) VALUES (1, 1, 'code', 'a', 'other')").run();
    expect(() => db.prepare("UPDATE categories SET category_code = ? WHERE id = 1").run(code)).toThrow();
  });

  it("rejects duplicate codes within one fund but not across funds", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount) VALUES
        (1, 'A', 2026, 1000), (2, 'B', 2026, 1000);
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category)
        VALUES (1, 1, 'code', 'a', 'other');
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category)
        VALUES (2, 2, 'code', 'b', 'other');
    `);
    expect(() =>
      db.prepare("INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category) VALUES (3, 1, 'code', 'c', 'other')").run(),
    ).toThrow();
  });
});
