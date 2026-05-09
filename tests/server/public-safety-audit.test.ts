import { describe, expect, it } from "vitest";
import {
  auditCurrentTextContent,
  auditPaths,
} from "../../scripts/audit-public-safety";

describe("public safety audit", () => {
  it("flags non-public workbook, database, upload, backup, env, and secret paths", () => {
    const findings = auditPaths({
      scope: "tracked",
      paths: [
        "imports/budget2026.xlsx",
        "app.db",
        "archive/app.sqlite3",
        "app.db.uploads/2026-05-08-budget.xlsx",
        "backups/app-20260508.db",
        ".env.local",
        "config/api-token.txt",
        "seeds/demo/demo-budget.xlsx",
        "vendor/xlsx-0.20.3.tgz",
        "src/vite-env.d.ts",
      ],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        scope: "tracked",
        path: "imports/budget2026.xlsx",
        severity: "fail",
        rule: "runtime-or-private-data-path",
      }),
      expect.objectContaining({
        path: "app.db",
        rule: "runtime-or-private-data-path",
      }),
      expect.objectContaining({
        path: "archive/app.sqlite3",
        rule: "runtime-or-private-data-path",
      }),
      expect.objectContaining({
        path: "app.db.uploads/2026-05-08-budget.xlsx",
        rule: "runtime-or-private-data-path",
      }),
      expect.objectContaining({
        path: "backups/app-20260508.db",
        rule: "runtime-or-private-data-path",
      }),
      expect.objectContaining({
        path: ".env.local",
        rule: "secret-like-path",
      }),
      expect.objectContaining({
        path: "config/api-token.txt",
        rule: "secret-like-path",
      }),
    ]);
  });

  it("allows the public demo workbook and vendored xlsx dependency package", () => {
    const findings = auditPaths({
      scope: "history",
      paths: [
        "seeds/demo/demo-budget.xlsx",
        "vendor/xlsx-0.20.3.tgz",
        "server/imports/uploadWorkbook.ts",
        "src/features/imports/WorkbookImportControl.tsx",
      ],
    });

    expect(findings).toEqual([]);
  });

  it("scans only current tracked text content for secret-looking assignments", () => {
    const findings = auditCurrentTextContent([
      {
        path: "src/config.ts",
        text: "export const DEMO_TOKEN_LABEL = 'public label';\n",
      },
      {
        path: "scripts/deploy.env.example",
        text: "BUDGET_API_TOKEN=replace-me-before-use\n",
      },
      {
        path: "README.md",
        text: "Use token as a generic word in docs without assigning a value.\n",
      },
    ]);

    expect(findings).toEqual([
      expect.objectContaining({
        scope: "tracked-content",
        path: "scripts/deploy.env.example",
        severity: "fail",
        rule: "secret-like-content",
      }),
    ]);
  });

});
