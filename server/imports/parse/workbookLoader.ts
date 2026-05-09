import { createRequire } from "node:module";
import {
  SIMPLE_WORKBOOK_HEADERS,
  SIMPLE_WORKBOOK_SHEET_NAMES,
  resolveSimpleWorkbookHeader,
  type SimpleWorkbookSheetName,
} from "../simpleWorkbookContract";
import type { SheetRow } from "./parseContext";
import { normalizeCell } from "./parseScalars";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

export function readSimpleWorkbook(workbookPath: string) {
  return XLSX.readFile(workbookPath);
}

export function assertRequiredWorkbookSheets(workbook: import("xlsx").WorkBook) {
  for (const sheetName of SIMPLE_WORKBOOK_SHEET_NAMES) {
    if (!workbook.Sheets[sheetName]) {
      throw new Error(`Missing required sheet: ${sheetName}`);
    }
  }
}

export function readWorkbookSheetRows(
  workbook: import("xlsx").WorkBook,
  sheetName: SimpleWorkbookSheetName,
): SheetRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Missing required sheet: ${sheetName}`);
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  });
  const header = (rows[0] ?? []).map(normalizeCell);
  const workbookHeader = resolveSimpleWorkbookHeader(sheetName, header);
  const expectedHeader = [...SIMPLE_WORKBOOK_HEADERS[sheetName]];

  const dataRows: SheetRow[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const rawRow = rows[index] ?? [];
    const values = Object.fromEntries(
      expectedHeader.map((column) => {
        const columnIndex = workbookHeader.indexOf(column);
        return [column, columnIndex === -1 ? "" : normalizeCell(rawRow[columnIndex])];
      }),
    );

    if (Object.values(values).every((value) => value === "")) {
      continue;
    }

    dataRows.push({
      rowNumber: index + 1,
      values,
    });
  }

  return dataRows;
}
