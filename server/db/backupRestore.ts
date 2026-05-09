import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

type BackupDatabaseOptions = {
  dbPath?: string;
  now?: Date;
  label?: string;
};

type RestoreDatabaseOptions = {
  dbPath?: string;
  backupPath: string;
  confirmed: boolean;
  now?: Date;
};

export function resolveDbPath(dbPath = process.env.BUDGET_DB_PATH ?? "app.db") {
  return resolve(dbPath);
}

export function resolveBackupDir(dbPath: string) {
  return join(dirname(resolve(dbPath)), "backups");
}

function formatTimestamp(now: Date) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  const seconds = String(now.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function createTimestampedBackupName(dbPath: string, now = new Date(), label?: string) {
  const extension = extname(dbPath) || ".db";
  const stem = basename(dbPath, extname(dbPath)) || "database";
  const suffix = label ? `-${label}` : "";

  return `${stem}${suffix}-${formatTimestamp(now)}${extension}`;
}

export function backupDatabase({ dbPath = resolveDbPath(), now = new Date(), label }: BackupDatabaseOptions = {}) {
  const resolvedDbPath = resolveDbPath(dbPath);

  if (!existsSync(resolvedDbPath)) {
    throw new Error(`Database not found: ${resolvedDbPath}`);
  }

  const backupDir = resolveBackupDir(resolvedDbPath);
  mkdirSync(backupDir, { recursive: true });

  const backupPath = join(backupDir, createTimestampedBackupName(resolvedDbPath, now, label));
  copyFileSync(resolvedDbPath, backupPath);

  return {
    db_path: resolvedDbPath,
    backup_path: backupPath,
  };
}

export function restoreDatabase({
  dbPath = resolveDbPath(),
  backupPath,
  confirmed,
  now = new Date(),
}: RestoreDatabaseOptions) {
  if (!confirmed) {
    throw new Error("Restore requires --yes");
  }

  const resolvedDbPath = resolveDbPath(dbPath);
  const resolvedBackupPath = resolve(backupPath);

  if (!existsSync(resolvedBackupPath)) {
    throw new Error(`Backup not found: ${resolvedBackupPath}`);
  }

  mkdirSync(dirname(resolvedDbPath), { recursive: true });

  const preRestoreBackupPath = existsSync(resolvedDbPath)
    ? backupDatabase({ dbPath: resolvedDbPath, now, label: "pre-restore" }).backup_path
    : null;

  copyFileSync(resolvedBackupPath, resolvedDbPath);

  return {
    db_path: resolvedDbPath,
    backup_path: resolvedBackupPath,
    pre_restore_backup_path: preRestoreBackupPath,
  };
}
