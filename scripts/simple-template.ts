import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { writeSimpleWorkbookTemplate } from "../server/imports/simpleWorkbookTemplate";

const workbookArg = process.argv[2];

if (!workbookArg) {
  throw new Error("Usage: tsx scripts/simple-template.ts <workbook-path>");
}

const workbookPath = resolve(workbookArg);
mkdirSync(dirname(workbookPath), { recursive: true });
writeSimpleWorkbookTemplate({ workbookPath });

console.log(
  JSON.stringify(
    {
      workbook_path: workbookPath,
    },
    null,
    2,
  ),
);
