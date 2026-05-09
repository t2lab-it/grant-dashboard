import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
  backupDatabase,
  restoreDatabase,
} from "../../server/db/backupRestore";

function writeMarkerDb(dbPath: string, value: string) {
  const db = new Database(dbPath);

  try {
    db.exec("CREATE TABLE IF NOT EXISTS marker (value TEXT NOT NULL)");
    db.exec("DELETE FROM marker");
    db.prepare("INSERT INTO marker (value) VALUES (?)").run(value);
  } finally {
    db.close();
  }
}

function readMarkerDb(dbPath: string) {
  const db = new Database(dbPath, { readonly: true });

  try {
    return db.prepare("SELECT value FROM marker").get() as { value: string };
  } finally {
    db.close();
  }
}

describe("backup/restore workflow", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("creates a timestamped backup file next to the target database", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-backup-helper-"));
    const dbPath = join(rootDir, "app.db");
    tempDirs.push(rootDir);
    writeMarkerDb(dbPath, "before-backup");

    const result = backupDatabase({ dbPath, now: new Date("2026-04-20T10:11:12.000Z") });

    expect(result).toEqual({
      db_path: dbPath,
      backup_path: join(rootDir, "backups", "app-20260420-101112.db"),
    });
    expect(existsSync(result.backup_path)).toBe(true);
    expect(readMarkerDb(result.backup_path)).toEqual({ value: "before-backup" });
  });

  it("refuses restore without explicit confirmation", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-restore-guard-"));
    const dbPath = join(rootDir, "app.db");
    const backupPath = join(rootDir, "backup.db");
    tempDirs.push(rootDir);
    writeMarkerDb(dbPath, "current");
    writeMarkerDb(backupPath, "backup");

    expect(() =>
      restoreDatabase({
        dbPath,
        backupPath,
        confirmed: false,
        now: new Date("2026-04-20T10:11:12.000Z"),
      }),
    ).toThrowError("Restore requires --yes");
  });

  it("creates a rollback backup before restoring the target database", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-restore-helper-"));
    const dbPath = join(rootDir, "app.db");
    const backupPath = join(rootDir, "incoming.db");
    tempDirs.push(rootDir);
    writeMarkerDb(dbPath, "current");
    writeMarkerDb(backupPath, "restored");

    const result = restoreDatabase({
      dbPath,
      backupPath,
      confirmed: true,
      now: new Date("2026-04-20T10:11:12.000Z"),
    });

    expect(result).toEqual({
      db_path: dbPath,
      backup_path: backupPath,
      pre_restore_backup_path: join(rootDir, "backups", "app-pre-restore-20260420-101112.db"),
    });
    expect(readMarkerDb(result.pre_restore_backup_path!)).toEqual({ value: "current" });
    expect(readMarkerDb(dbPath)).toEqual({ value: "restored" });
  });

  it("prints backup command output as JSON", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-backup-cli-"));
    const dbPath = join(rootDir, "app.db");
    tempDirs.push(rootDir);
    writeMarkerDb(dbPath, "cli-backup");

    const tsxBin = join(process.cwd(), "node_modules", ".bin", "tsx");
    const stdout = execFileSync(tsxBin, [join(process.cwd(), "scripts", "backup.ts")], {
      env: { ...process.env, BUDGET_DB_PATH: dbPath },
      stdio: "pipe",
      encoding: "utf8",
    });

    const result = JSON.parse(stdout) as { db_path: string; backup_path: string };

    expect(result.db_path).toBe(dbPath);
    expect(result.backup_path.startsWith(join(rootDir, "backups", "app-"))).toBe(true);
    expect(result.backup_path.endsWith(".db")).toBe(true);
    expect(existsSync(result.backup_path)).toBe(true);
    expect(readMarkerDb(result.backup_path)).toEqual({ value: "cli-backup" });
  });

  it("prints restore command output as JSON and replaces DB contents", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "budget-restore-cli-"));
    const dbPath = join(rootDir, "app.db");
    const backupPath = join(rootDir, "incoming.db");
    tempDirs.push(rootDir);
    writeMarkerDb(dbPath, "cli-current");
    writeMarkerDb(backupPath, "cli-restored");

    const tsxBin = join(process.cwd(), "node_modules", ".bin", "tsx");
    const stdout = execFileSync(
      tsxBin,
      [join(process.cwd(), "scripts", "restore.ts"), backupPath, "--yes"],
      {
        env: { ...process.env, BUDGET_DB_PATH: dbPath },
        stdio: "pipe",
        encoding: "utf8",
      },
    );

    const result = JSON.parse(stdout) as {
      db_path: string;
      backup_path: string;
      pre_restore_backup_path: string | null;
    };

    expect(result.db_path).toBe(dbPath);
    expect(result.backup_path).toBe(backupPath);
    expect(result.pre_restore_backup_path).not.toBeNull();
    const rollbackPath = result.pre_restore_backup_path!;
    expect(rollbackPath.startsWith(join(rootDir, "backups", "app-pre-restore-"))).toBe(true);
    expect(rollbackPath.endsWith(".db")).toBe(true);
    expect(readMarkerDb(rollbackPath)).toEqual({ value: "cli-current" });
    expect(readMarkerDb(dbPath)).toEqual({ value: "cli-restored" });
  });
});
