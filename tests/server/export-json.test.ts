import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { seedTestDatabase } from "../support/seed";

function runExportJsonScript(rootDir: string, dbPath: string) {
  const tsxBin = join(process.cwd(), "node_modules", ".bin", "tsx");

  return execFileSync(tsxBin, [join(process.cwd(), "scripts", "export-json.ts")], {
    cwd: rootDir,
    env: { ...process.env, BUDGET_DB_PATH: dbPath },
    stdio: "pipe",
    encoding: "utf8",
  });
}

describe("JSON export workflow", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("writes a deterministic pretty-printed snapshot for git review", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-export-deterministic-"));
    const dbPath = join(rootDir, "app.db");
    tempDirs.push(rootDir);
    seedTestDatabase(dbPath);

    const db = new Database(dbPath);
    try {
      db.exec(`
        INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount) VALUES
          (3, 1, 1, '2026-10-03', '2026-10', '後の予定', 2000),
          (2, 1, 1, '2026-10-02', '2026-10', '中間の予定', 1500);
      `);
    } finally {
      db.close();
    }

    const stdout = runExportJsonScript(rootDir, dbPath);
    const result = JSON.parse(stdout) as {
      db_path: string;
      output_path: string;
      record_counts: Record<string, number>;
    };

    const outputPath = join(rootDir, "exports", "current.json");
    expect(result).toEqual({
      db_path: dbPath,
      output_path: outputPath,
      record_counts: { funds: 1, categories: 1, budget_lines: 1, planned_items: 3, actual_entries: 1 },
    });
    const fileText = readFileSync(outputPath, "utf8");
    const payload = JSON.parse(fileText) as {
      planned_items: Array<{ id: number }>;
    };

    expect(payload.planned_items.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(fileText).toBe(`${JSON.stringify(payload, null, 2)}\n`);
  });
});
