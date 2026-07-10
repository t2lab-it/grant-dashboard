import type { FastifyInstance } from "fastify";
import { buildJsonExportPayload } from "../exports/jsonSnapshot";
import {
  buildLedgerWorkbookExport,
  LedgerWorkbookError,
} from "../exports/ledgerWorkbook";
import {
  buildWorkbookExportPreview,
  saveWorkbookExport,
  WorkbookExportError,
} from "../exports/workbookExport";

function parseFiscalYear(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const fiscalYear = Number(value);
  return Number.isInteger(fiscalYear) && fiscalYear > 0 ? fiscalYear : undefined;
}

function parsePositiveIntQuery(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function registerExportRoutes(app: FastifyInstance, { now }: { now: () => Date }) {
  app.get("/api/exports/json", () => {
    return buildJsonExportPayload(app.db);
  });

  app.get("/api/exports/ledger.xlsx", (request, reply) => {
    const query = request.query as { year?: unknown; fundId?: unknown };
    try {
      const exportResult = buildLedgerWorkbookExport(app.db, {
        fiscalYear: parseFiscalYear(query.year),
        fundId: parsePositiveIntQuery(query.fundId),
        exportedAt: now(),
      });
      reply.header("Content-Disposition", `attachment; filename="${exportResult.filename}"`);
      reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return reply.send(exportResult.buffer);
    } catch (error) {
      if (error instanceof LedgerWorkbookError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }

      throw error;
    }
  });

  app.get("/api/exports/workbook/preview", () => {
    return buildWorkbookExportPreview(app.db);
  });

  app.post("/api/exports/workbook", (_request, reply) => {
    try {
      return saveWorkbookExport(app.db);
    } catch (error) {
      if (error instanceof WorkbookExportError) {
        return reply.code(error.statusCode).send({
          message: error.message,
          ...error.preview,
        });
      }

      throw error;
    }
  });
}
