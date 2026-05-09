import type Database from "better-sqlite3";
import { accessSync, constants, existsSync, rmSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { createEmptyWorkbookDiffSummary, diffWorkbookRows } from "./workbookDiff";
import { buildWorkbookRows, readWorkbookRows, writeWorkbookRows } from "./workbookRows";

type LatestImportRow = {
  id: number;
  source_filename: string;
  imported_at: string;
  workbook_path: string;
};

export type WorkbookExportPreview = {
  available: boolean;
  workbook_path: string;
  source_filename: string;
  imported_at: string;
  exported_at?: string;
  reason?: string;
  changes: ReturnType<typeof createEmptyWorkbookDiffSummary>;
};

export class WorkbookExportError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly preview: WorkbookExportPreview,
  ) {
    super(message);
  }
}

function createUnavailablePreview(
  latestImport: LatestImportRow | undefined,
  reason: string,
): WorkbookExportPreview {
  return {
    available: false,
    workbook_path: latestImport?.workbook_path ?? "",
    source_filename: latestImport?.source_filename ?? "",
    imported_at: latestImport?.imported_at ?? "",
    reason,
    changes: createEmptyWorkbookDiffSummary(),
  };
}

function getLatestImport(db: Database.Database) {
  return db
    .prepare(
      `
      SELECT id, source_filename, imported_at, workbook_path
      FROM imports
      ORDER BY imported_at DESC, id DESC
      LIMIT 1
      `,
    )
    .get() as LatestImportRow | undefined;
}

function prepareWorkbookExport(db: Database.Database) {
  const latestImport = getLatestImport(db);
  if (!latestImport) {
    return {
      preview: createUnavailablePreview(undefined, "最新のインポート履歴がありません。"),
    };
  }

  if (latestImport.workbook_path.trim() === "") {
    return {
      preview: createUnavailablePreview(
        latestImport,
        "最新のインポート履歴に workbook_path がありません。",
      ),
    };
  }

  if (!existsSync(latestImport.workbook_path)) {
    return {
      preview: createUnavailablePreview(
        latestImport,
        "元の workbook ファイルが見つかりません。",
      ),
      statusCode: 404,
    };
  }

  try {
    accessSync(dirname(latestImport.workbook_path), constants.W_OK);
  } catch {
    return {
      preview: createUnavailablePreview(
        latestImport,
        "元の workbook ファイルを書き込めません。",
      ),
      statusCode: 400,
    };
  }

  try {
    const generatedRows = buildWorkbookRows(db);
    const currentRows = readWorkbookRows(latestImport.workbook_path);
    const changes = diffWorkbookRows(currentRows, generatedRows);

    return {
      latestImport,
      generatedRows,
      preview: {
        available: true,
        workbook_path: latestImport.workbook_path,
        source_filename: latestImport.source_filename,
        imported_at: latestImport.imported_at,
        changes,
      } as WorkbookExportPreview,
    };
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : "workbook のプレビューを生成できませんでした。";
    return {
      preview: createUnavailablePreview(latestImport, reason),
      statusCode: 400,
    };
  }
}

export function buildWorkbookExportPreview(db: Database.Database): WorkbookExportPreview {
  return prepareWorkbookExport(db).preview;
}

export function saveWorkbookExport(db: Database.Database) {
  const prepared = prepareWorkbookExport(db);
  if (!prepared.preview.available || !prepared.latestImport || !prepared.generatedRows) {
    throw new WorkbookExportError(
      "reason" in prepared.preview
        ? prepared.preview.reason ?? "workbook を保存できません。"
        : "workbook を保存できません。",
      prepared.statusCode ?? 400,
      prepared.preview,
    );
  }

  const targetPath = prepared.latestImport.workbook_path;
  const tempPath = join(
    dirname(targetPath),
    `.workbook-export-${process.pid}-${Date.now()}.xlsx`,
  );

  try {
    writeWorkbookRows(tempPath, prepared.generatedRows);
    renameSync(tempPath, targetPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }

  return {
    ...prepared.preview,
    exported_at: new Date().toISOString(),
  };
}
