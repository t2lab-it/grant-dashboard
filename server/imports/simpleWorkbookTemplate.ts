import { createRequire } from "node:module";
import {
  SIMPLE_WORKBOOK_SHEET_NAMES,
  getSimpleWorkbookHeaders,
} from "./simpleWorkbookContract";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

function buildSimpleWorkbookTemplate() {
  const workbook = XLSX.utils.book_new();

  for (const sheetName of SIMPLE_WORKBOOK_SHEET_NAMES) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([getSimpleWorkbookHeaders(sheetName)]),
      sheetName,
    );
  }

  return workbook;
}

export function createSimpleWorkbookTemplateBuffer() {
  return XLSX.write(buildSimpleWorkbookTemplate(), { bookType: "xlsx", type: "buffer" }) as Buffer;
}

export function writeSimpleWorkbookTemplate({ workbookPath }: { workbookPath: string }) {
  const workbook = buildSimpleWorkbookTemplate();

  XLSX.writeFile(workbook, workbookPath);
}
