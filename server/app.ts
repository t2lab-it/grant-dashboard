import Fastify from "fastify";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrate";
import { registerActualEntryRoutes } from "./routes/actual-entries";
import { registerClassificationRoutes } from "./routes/classifications";
import { registerExportRoutes } from "./routes/exports";
import { registerFiscalYearComparisonRoutes } from "./routes/fiscal-year-comparison";
import { registerFundRoutes } from "./routes/funds";
import { registerImportRoutes } from "./routes/imports";
import { registerHeaderAlertRoutes } from "./routes/header-alerts";
import { registerOverviewRoutes } from "./routes/overview";
import { registerPlannedItemRoutes } from "./routes/planned-items";
import { registerSearchRoutes } from "./routes/search";
import { ensureDefaultAuxiliaryLabels } from "./services/classifications";
import { sendApiError } from "./routes/routeHelpers";

function isApiRequestUrl(rawUrl: string) {
  const pathname = new URL(rawUrl, "http://localhost").pathname;
  return pathname === "/api" || pathname.startsWith("/api/");
}

export async function buildServer({
  dbPath = "app.db",
  seedDefaultClassifications = true,
  now = () => new Date(),
}: { dbPath?: string; seedDefaultClassifications?: boolean; now?: () => Date } = {}) {
  const db = createDb(dbPath);
  runMigrations(db);
  if (seedDefaultClassifications) {
    ensureDefaultAuxiliaryLabels(db);
  }

  const app = Fastify();
  app.decorate("db", db);
  app.addHook("onClose", async () => {
    db.close();
  });

  app.setNotFoundHandler((request, reply) => {
    if (isApiRequestUrl(request.url)) {
      sendApiError(reply, 404, {
        code: "api_not_found",
        message: "APIが見つかりません。",
      });
      return;
    }

    reply.code(404).send({
      message: "Route " + request.method + ":" + request.url + " not found",
      error: "Not Found",
      statusCode: 404,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (!isApiRequestUrl(request.url)) {
      throw error;
    }

    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;

    if (statusCode !== undefined && statusCode < 500) {
      sendApiError(reply, statusCode, {
        code: "invalid_request",
        message: "リクエスト内容を確認してください。",
      });
      return;
    }

    sendApiError(reply, statusCode ?? 500, {
      code: "internal_error",
      message: "サーバーでエラーが発生しました。",
    });
  });

  registerOverviewRoutes(app, { now });
  registerFiscalYearComparisonRoutes(app, { now });
  registerHeaderAlertRoutes(app, { now });
  registerSearchRoutes(app, { now });
  registerClassificationRoutes(app);
  registerFundRoutes(app);
  registerPlannedItemRoutes(app);
  registerActualEntryRoutes(app);
  registerExportRoutes(app, { now });
  registerImportRoutes(app, { dbPath });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = await buildServer({ dbPath: process.env.BUDGET_DB_PATH ?? "app.db" });
  await app.listen({ port: Number(process.env.PORT ?? 3001) });
}
