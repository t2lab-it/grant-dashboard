import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parsePositiveIntParam, sendApiError, sendNotFound } from "./routeHelpers";
import {
  commitUploadedWorkbook,
  previewUploadedWorkbook,
  WORKBOOK_UPLOAD_CONTENT_TYPES,
} from "../imports/uploadWorkbook";
import { createSimpleWorkbookTemplateBuffer } from "../imports/simpleWorkbookTemplate";
import { getImportReview, listImportReviews } from "../services/importReviews";

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

  app.get("/api/imports", () => listImportReviews(app.db));

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
    } catch (error) {
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
    } catch (error) {
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

    const review = getImportReview(app.db, importId);
    if (!review) {
      sendNotFound(reply, "import_not_found", "対象のインポート履歴が見つかりません。");
      return;
    }

    return review;
  });
}
