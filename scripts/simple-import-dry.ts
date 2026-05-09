import { resolve } from "node:path";
import { dryRunSimpleWorkbookImport } from "../server/imports/simpleDryRunImport";

const workbookPath = process.argv[2];

if (!workbookPath) {
  throw new Error("Usage: tsx scripts/simple-import-dry.ts <workbook-path>");
}

const result = dryRunSimpleWorkbookImport({ workbookPath: resolve(workbookPath) });

console.log(
  JSON.stringify(
    {
      workbook_path: result.workbook_path,
      counts: result.counts,
      warnings: result.warnings,
    },
    null,
    2,
  ),
);
