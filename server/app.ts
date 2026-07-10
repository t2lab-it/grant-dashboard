import Fastify from "fastify";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrate";
import { registerActualEntryRoutes } from "./routes/actual-entries";
import { registerClassificationRoutes } from "./routes/classifications";
import { registerExportRoutes } from "./routes/exports";
import { registerFundRoutes } from "./routes/funds";
import { registerImportRoutes } from "./routes/imports";
import { registerHeaderAlertRoutes } from "./routes/header-alerts";
import { registerOverviewRoutes } from "./routes/overview";
import { registerPlannedItemRoutes } from "./routes/planned-items";
import { registerSearchRoutes } from "./routes/search";
import { ensureDefaultAuxiliaryLabels } from "./services/classifications";

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

  registerOverviewRoutes(app, { now });
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
