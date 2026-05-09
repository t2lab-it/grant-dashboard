import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  it("writes exports/current.json and reports the exported record counts", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-export-cli-"));
    const dbPath = join(rootDir, "app.db");
    tempDirs.push(rootDir);
    const summary = seedTestDatabase(dbPath);

    const stdout = runExportJsonScript(rootDir, dbPath);

    const result = JSON.parse(stdout) as {
      db_path: string;
      output_path: string;
      record_counts: Record<string, number>;
    };

    expect(result).toEqual({
      db_path: dbPath,
      output_path: join(rootDir, "exports", "current.json"),
      record_counts: summary.counts,
    });
    expect(existsSync(result.output_path)).toBe(true);
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

    runExportJsonScript(rootDir, dbPath);

    const outputPath = join(rootDir, "exports", "current.json");
    const fileText = readFileSync(outputPath, "utf8");
    const payload = JSON.parse(fileText) as {
      planned_items: Array<{ id: number }>;
    };

    expect(payload.planned_items.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(fileText).toBe(`${JSON.stringify(payload, null, 2)}\n`);
  });
});
