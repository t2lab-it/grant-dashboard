import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parsePositiveIntParam, sendNotFound } from "./routeHelpers";
import {
  commitUploadedWorkbook,
  previewUploadedWorkbook,
  WORKBOOK_UPLOAD_CONTENT_TYPE,
} from "../imports/uploadWorkbook";
import { createSimpleWorkbookTemplateBuffer } from "../imports/simpleWorkbookTemplate";
import { getImportReview, listImportReviews } from "../services/importReviews";

const workbookFilenameSchema = z.string().trim().min(1);

export function registerImportRoutes(app: FastifyInstance, { dbPath }: { dbPath: string }) {
  app.addContentTypeParser(
    WORKBOOK_UPLOAD_CONTENT_TYPE,
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

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
      reply.code(400).send({ message: "`.xlsx` ファイルを選択してください。" });
      return;
    }

    try {
      return previewUploadedWorkbook({
        buffer: request.body,
        sourceFilename: filename.data,
      });
    } catch (error) {
      reply.code(400).send({
        message: error instanceof Error ? error.message : "workbook をプレビューできませんでした。",
      });
    }
  });

  app.post("/api/imports/workbook", (request, reply) => {
    const filename = workbookFilenameSchema.safeParse(request.headers["x-workbook-filename"]);
    if (!filename.success || !Buffer.isBuffer(request.body)) {
      reply.code(400).send({ message: "`.xlsx` ファイルを選択してください。" });
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
      reply.code(400).send({
        message: error instanceof Error ? error.message : "workbook を取り込めませんでした。",
      });
    }
  });

  app.get("/api/imports/:importId", (request, reply) => {
    const importId = parsePositiveIntParam(
      reply,
      (request.params as { importId?: string }).importId,
      "Invalid import id",
    );
    if (importId === undefined) {
      return;
    }

    const review = getImportReview(app.db, importId);
    if (!review) {
      sendNotFound(reply, "Import not found");
      return;
    }

    return review;
  });
}
