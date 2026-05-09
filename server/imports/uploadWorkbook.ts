import type Database from "better-sqlite3";
import { basename, join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { WorkbookImportPreview, WorkbookImportResult } from "../../src/contracts/imports";
import { getDemoImportMetadata } from "../services/demoMetadata";
import { dryRunSimpleWorkbookImport } from "./simpleDryRunImport";
import { persistWorkbookImport } from "./persistImport";

export const WORKBOOK_UPLOAD_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const WORKBOOK_UPLOAD_CONTENT_TYPES = [
  WORKBOOK_UPLOAD_CONTENT_TYPE,
  "application/octet-stream",
];

export type WorkbookImportCommitResult = WorkbookImportResult;

function sanitizeFilename(sourceFilename: string) {
  const normalized = basename(sourceFilename).trim();
  const safeName = normalized.replace(/[^A-Za-z0-9._-]/g, "-");

  if (!safeName.toLowerCase().endsWith(".xlsx")) {
    throw new Error("`.xlsx` ファイルを選択してください。");
  }

  return safeName || "workbook.xlsx";
}

function writeTemporaryWorkbook(buffer: Buffer, sourceFilename: string) {
  const tempDir = mkdtempSync(join(tmpdir(), "budget-import-preview-"));
  const workbookPath = join(tempDir, sanitizeFilename(sourceFilename));
  writeFileSync(workbookPath, buffer);

  return {
    workbookPath,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

function createManagedWorkbookPath(dbPath: string, sourceFilename: string, importedAt: string) {
  const uploadDir = `${dbPath}.uploads`;
  mkdirSync(uploadDir, { recursive: true });

  const timestamp = importedAt.replace(/[:.]/g, "-");
  return join(uploadDir, `${timestamp}-${sanitizeFilename(sourceFilename)}`);
}

export function previewUploadedWorkbook({
  buffer,
  sourceFilename,
}: {
  buffer: Buffer;
  sourceFilename: string;
}): WorkbookImportPreview {
  const temporaryWorkbook = writeTemporaryWorkbook(buffer, sourceFilename);

  try {
    const draft = dryRunSimpleWorkbookImport({ workbookPath: temporaryWorkbook.workbookPath });
    return {
      source_filename: sanitizeFilename(sourceFilename),
      replace: true,
      counts: draft.counts,
      warnings: draft.warnings,
      demoImport: getDemoImportMetadata(draft.funds),
    };
  } finally {
    temporaryWorkbook.cleanup();
  }
}

export function commitUploadedWorkbook({
  db,
  dbPath,
  buffer,
  sourceFilename,
  importedAt,
}: {
  db: Database.Database;
  dbPath: string;
  buffer: Buffer;
  sourceFilename: string;
  importedAt: string;
}): WorkbookImportCommitResult {
  const workbookPath = createManagedWorkbookPath(dbPath, sourceFilename, importedAt);
  writeFileSync(workbookPath, buffer);

  try {
    const draft = dryRunSimpleWorkbookImport({ workbookPath });
    const summary = persistWorkbookImport({
      db,
      dbPath,
      draft,
      sourceFilename: sanitizeFilename(sourceFilename),
      importedAt,
      replace: true,
    });

    return {
      source_filename: sanitizeFilename(sourceFilename),
      workbook_path: workbookPath,
      import_id: summary.import_id,
      mode: summary.mode,
      counts: summary.counts,
      warning_count_by_code: summary.warning_count_by_code,
      demoImport: getDemoImportMetadata(draft.funds),
    };
  } catch (error) {
    rmSync(workbookPath, { force: true });
    throw error;
  }
}
