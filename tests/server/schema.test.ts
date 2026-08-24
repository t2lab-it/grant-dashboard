import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

function currentSchemaDb() {
  const db = new Database(":memory:");
  const schema = readFileSync(resolve(process.cwd(), "server/db/schema.sql"), "utf8");
  db.exec(schema);
  return db;
}

describe("category code schema constraints", () => {
  it.each([null, "", " ", " code "])("rejects invalid category code %j on insert and update", (code) => {
    const db = currentSchemaDb();
    db.prepare("INSERT INTO funds (id, name, fiscal_year, awarded_amount) VALUES (1, 'A', 2026, 1000)").run();

    expect(() =>
      db.prepare("INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category) VALUES (1, 1, ?, 'a', 'other')").run(code),
    ).toThrow();

    db.prepare("INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category) VALUES (1, 1, 'code', 'a', 'other')").run();
    expect(() => db.prepare("UPDATE categories SET category_code = ? WHERE id = 1").run(code)).toThrow();
  });

  it("rejects duplicate codes within one fund but not across funds", () => {
    const db = currentSchemaDb();
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
