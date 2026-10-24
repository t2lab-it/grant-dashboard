import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parsePositiveIntParam, sendApiError, sendNotFound } from "./routeHelpers";
import {
  commitUploadedWorkbook,
  previewUploadedWorkbook,
  WORKBOOK_UPLOAD_CONTENT_TYPES,
} from "../imports/uploadWorkbook";
import { createSimpleWorkbookTemplateBuffer } from "../imports/simpleWorkbookTemplate";
import { getImportReview, listImportReviews, UnsupportedReconciliationFormatError } from "../services/importReviews";

const workbookFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .refine((name) => name.toLowerCase().endsWith(".xlsx"));

export function registerImportRoutes(app: FastifyInstance, { dbPath }: { dbPath: string }) {
  for (const contentType of WORKBOOK_UPLOAD_CONTENT_TYPES) {
    app.addContentTypeParser(
      contentType,
      { parseAs: "buffer" },
      (_request, body, done) => done(null, body),
    );
  }

  app.get("/api/imports", (_request, reply) => {
    try { return listImportReviews(app.db); }
    catch { sendApiError(reply, 500, { code: "import_history_read_failed", message: "履歴を読み込めませんでした。保存先を確認して再試行してください。" }); }
  });

  app.get("/api/imports/workbook/template.xlsx", (_request, reply) => {
    reply
      .header(
        "content-type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      .header("content-disposition", 'attachment; filename="budget-dashboard-template.xlsx"')
      .send(createSimpleWorkbookTemplateBuffer());
  });

  app.post("/api/imports/workbook/preview", (request, reply) => {
    const filename = workbookFilenameSchema.safeParse(request.headers["x-workbook-filename"]);
    if (!filename.success || !Buffer.isBuffer(request.body)) {
      sendApiError(reply, 400, {
        code: "invalid_workbook_file",
        message: "`.xlsx` ファイルを選択してください。",
      });
      return;
    }

    try {
      return previewUploadedWorkbook({
        buffer: request.body,
        sourceFilename: filename.data,
      });
    } catch {
      sendApiError(reply, 400, {
        code: "workbook_preview_failed",
        message: "workbookをプレビューできませんでした。",
      });
    }
  });

  app.post("/api/imports/workbook", (request, reply) => {
    const filename = workbookFilenameSchema.safeParse(request.headers["x-workbook-filename"]);
    if (!filename.success || !Buffer.isBuffer(request.body)) {
      sendApiError(reply, 400, {
        code: "invalid_workbook_file",
        message: "`.xlsx` ファイルを選択してください。",
      });
      return;
    }

    try {
      const payload = commitUploadedWorkbook({
        db: app.db,
        dbPath,
        buffer: request.body,
        sourceFilename: filename.data,
        importedAt: new Date().toISOString(),
      });
      reply.code(201).send(payload);
    } catch {
      sendApiError(reply, 400, {
        code: "workbook_import_failed",
        message: "workbookを取り込めませんでした。",
      });
    }
  });

  app.get("/api/imports/:importId", (request, reply) => {
    const importId = parsePositiveIntParam(
      reply,
      (request.params as { importId?: string }).importId,
      "invalid_import_id",
      "インポートIDを確認してください。",
    );
    if (importId === undefined) {
      return;
    }

    let review;
    try { review = getImportReview(app.db, importId); }
    catch (error) {
      if (error instanceof UnsupportedReconciliationFormatError) {
        sendApiError(reply, 422, { code: "unsupported_reconciliation_format", message: error.message });
        return;
      }
      sendApiError(reply, 500, { code: "import_history_read_failed", message: "履歴の保存内容を読み込めませんでした。再試行し、解消しない場合は保存先と履歴ファイルを確認してください。" });
      return;
    }
    if (!review) {
      sendNotFound(reply, "import_not_found", "対象のインポート履歴が見つかりません。");
      return;
    }

    return review;
  });
}
