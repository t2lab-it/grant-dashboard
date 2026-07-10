import type { FastifyInstance } from "fastify";
import { parsePositiveIntParam, sendApiError } from "./routeHelpers";
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

export function registerExportRoutes(app: FastifyInstance, { now }: { now: () => Date }) {
  app.get("/api/exports/json", () => {
    return buildJsonExportPayload(app.db);
  });

  app.get("/api/exports/ledger.xlsx", (request, reply) => {
    const query = request.query as { year?: unknown; fundId?: unknown };
    const fundId =
      query.fundId === undefined
        ? undefined
        : parsePositiveIntParam(
            reply,
            query.fundId,
            "invalid_fund_id",
            "予算IDを確認してください。",
          );
    if (query.fundId !== undefined && fundId === undefined) {
      return;
    }

    try {
      const exportResult = buildLedgerWorkbookExport(app.db, {
        fiscalYear: parseFiscalYear(query.year),
        fundId,
        exportedAt: now(),
      });
      reply.header("Content-Disposition", `attachment; filename="${exportResult.filename}"`);
      reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return reply.send(exportResult.buffer);
    } catch (error) {
      if (error instanceof LedgerWorkbookError) {
        const payload =
          error.statusCode === 404
            ? { code: "fund_not_found", message: "対象の予算が見つかりません。" }
            : {
                code: "fund_fiscal_year_mismatch",
                message: "予算が指定した年度に属していません。",
              };
        sendApiError(reply, error.statusCode, payload);
        return;
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
        sendApiError(reply, error.statusCode, {
          code: "workbook_export_unavailable",
          message: "ワークブックを保存できませんでした。",
        });
        return;
      }

      throw error;
    }
  });
}
