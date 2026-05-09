import type Database from "better-sqlite3";
import { createRequire } from "node:module";
import {
  SIMPLE_WORKBOOK_HEADERS,
  SIMPLE_WORKBOOK_SHEET_NAMES,
  resolveSimpleWorkbookHeader,
  type SimpleWorkbookSheetName,
} from "../imports/simpleWorkbookContract";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

export type WorkbookCellValue = string | number | null;
export type WorkbookSheetRow = Record<string, WorkbookCellValue>;
export type WorkbookRows = {
  [K in SimpleWorkbookSheetName]: WorkbookSheetRow[];
};

function normalizeCell(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function assertWorkbookIdentity(value: string | null, label: string, context: string) {
  if (value === null || value.trim() === "") {
    throw new Error(`Missing ${label} required for workbook export: ${context}`);
  }

  return value;
}

function readSheetRows(
  workbook: import("xlsx").WorkBook,
  sheetName: SimpleWorkbookSheetName,
): WorkbookSheetRow[] {
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

  const dataRows: WorkbookSheetRow[] = [];
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

    dataRows.push(values);
  }

  return dataRows;
}

export function readWorkbookRows(workbookPath: string): WorkbookRows {
  const workbook = XLSX.readFile(workbookPath);

  return Object.fromEntries(
    SIMPLE_WORKBOOK_SHEET_NAMES.map((sheetName) => [
      sheetName,
      readSheetRows(workbook, sheetName),
    ]),
  ) as WorkbookRows;
}

export function writeWorkbookRows(workbookPath: string, rows: WorkbookRows) {
  const workbook = XLSX.utils.book_new();

  for (const sheetName of SIMPLE_WORKBOOK_SHEET_NAMES) {
    const header = [...SIMPLE_WORKBOOK_HEADERS[sheetName]];
    const sheetRows = rows[sheetName].map((row) =>
      header.map((column) => {
        const value = row[column];
        return value === null ? "" : value;
      }),
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([header, ...sheetRows]),
      sheetName,
    );
  }

  XLSX.writeFile(workbook, workbookPath);
}

type ClassificationRow = {
  target_type: "fund" | "planned_item" | "actual_entry";
  target_id: number;
  kind: "project" | "auxiliary";
  name: string;
};

function classificationKey(
  targetType: ClassificationRow["target_type"],
  targetId: number,
  kind: ClassificationRow["kind"],
) {
  return `${targetType}:${targetId}:${kind}`;
}

function buildClassificationNameMap(db: Database.Database) {
  const rows = db
    .prepare(
      `
      SELECT ca.target_type, ca.target_id, t.kind, t.name
      FROM classification_assignments ca
      INNER JOIN classification_tags t ON t.id = ca.tag_id
      ORDER BY ca.target_type, ca.target_id, t.id
      `,
    )
    .all() as ClassificationRow[];
  const namesByTarget = new Map<string, string[]>();

  for (const row of rows) {
    const key = classificationKey(row.target_type, row.target_id, row.kind);
    const names = namesByTarget.get(key) ?? [];
    names.push(row.name);
    namesByTarget.set(key, names);
  }

  return {
    join(targetType: ClassificationRow["target_type"], targetId: number, kind: ClassificationRow["kind"]) {
      return namesByTarget.get(classificationKey(targetType, targetId, kind))?.join(";") ?? "";
    },
  };
}

export function buildWorkbookRows(db: Database.Database): WorkbookRows {
  const classificationNames = buildClassificationNameMap(db);
  const funds = db
    .prepare(
      `
      SELECT id, fund_code, name, fiscal_year, awarded_amount, notes, display_order
      FROM funds
      ORDER BY display_order, id
      `,
    )
    .all() as Array<{
      id: number;
      fund_code: string | null;
      name: string;
      fiscal_year: number;
      awarded_amount: number;
      notes: string;
      display_order: number;
    }>;

  const categories = db
    .prepare(
      `
      SELECT c.id, f.fund_code, c.category_code, c.name, c.cross_aggregate_category, c.display_order
      FROM categories c
      INNER JOIN funds f ON f.id = c.fund_id
      ORDER BY f.display_order, f.id, c.display_order, c.id
      `,
    )
    .all() as Array<{
      id: number;
      fund_code: string | null;
      category_code: string | null;
      name: string;
      cross_aggregate_category: string;
      display_order: number;
    }>;

  const budgetLines = db
    .prepare(
      `
      SELECT bl.id, f.fund_code, c.category_code, bl.amount, bl.notes
      FROM budget_lines bl
      INNER JOIN funds f ON f.id = bl.fund_id
      INNER JOIN categories c ON c.id = bl.category_id
      ORDER BY f.display_order, f.id, c.display_order, c.id, bl.id
      `,
    )
    .all() as Array<{
      id: number;
      fund_code: string | null;
      category_code: string | null;
      amount: number | null;
      notes: string;
    }>;

  const plannedItems = db
    .prepare(
      `
      SELECT
        p.id,
        p.planned_ref,
        f.fund_code,
        c.category_code,
        p.planned_date,
        p.scheduled_month,
        p.description,
        p.amount,
        p.notes
      FROM planned_items p
      INNER JOIN funds f ON f.id = p.fund_id
      INNER JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'planned'
      ORDER BY p.planned_date, p.id
      `,
    )
    .all() as Array<{
      id: number;
      planned_ref: string | null;
      fund_code: string | null;
      category_code: string | null;
      planned_date: string;
      scheduled_month: string;
      description: string;
      amount: number;
      notes: string;
    }>;

  const actualEntries = db
    .prepare(
      `
      SELECT
        ae.id,
        f.fund_code,
        c.category_code,
        ae.actual_date,
        ae.description,
        ae.amount,
        p.planned_ref,
        ae.notes
      FROM actual_entries ae
      INNER JOIN funds f ON f.id = ae.fund_id
      INNER JOIN categories c ON c.id = ae.category_id
      LEFT JOIN planned_items p ON p.id = ae.planned_item_id
      ORDER BY ae.actual_date, ae.id
      `,
    )
    .all() as Array<{
      id: number;
      fund_code: string | null;
      category_code: string | null;
      actual_date: string;
      description: string;
      amount: number;
      planned_ref: string | null;
      notes: string;
    }>;

  return {
    funds: funds.map((row) => ({
      fund_code: assertWorkbookIdentity(row.fund_code, "fund_code", `fund ${row.id}`),
      name: row.name,
      fiscal_year: row.fiscal_year,
      awarded_amount: row.awarded_amount,
      notes: row.notes,
      project_tags: classificationNames.join("fund", row.id, "project"),
      auxiliary_labels: classificationNames.join("fund", row.id, "auxiliary"),
      display_order: row.display_order,
    })),
    categories: categories.map((row) => ({
      fund_code: assertWorkbookIdentity(row.fund_code, "fund_code", `category ${row.id}`),
      category_code: assertWorkbookIdentity(
        row.category_code,
        "category_code",
        `category ${row.id}`,
      ),
      name: row.name,
      cross_aggregate_category: row.cross_aggregate_category,
      display_order: row.display_order,
    })),
    budget_lines: budgetLines.map((row) => ({
      fund_code: assertWorkbookIdentity(row.fund_code, "fund_code", `budget line ${row.id}`),
      category_code: assertWorkbookIdentity(
        row.category_code,
        "category_code",
        `budget line ${row.id}`,
      ),
      amount: row.amount,
      notes: row.notes,
    })),
    planned_items: plannedItems.map((row) => ({
      planned_ref: assertWorkbookIdentity(row.planned_ref, "planned_ref", `planned item ${row.id}`),
      fund_code: assertWorkbookIdentity(row.fund_code, "fund_code", `planned item ${row.id}`),
      category_code: assertWorkbookIdentity(
        row.category_code,
        "category_code",
        `planned item ${row.id}`,
      ),
      planned_date: row.planned_date,
      scheduled_month: row.scheduled_month,
      description: row.description,
      amount: row.amount,
      notes: row.notes,
      auxiliary_labels: classificationNames.join("planned_item", row.id, "auxiliary"),
    })),
    actual_entries: actualEntries.map((row) => ({
      fund_code: assertWorkbookIdentity(row.fund_code, "fund_code", `actual entry ${row.id}`),
      category_code: assertWorkbookIdentity(
        row.category_code,
        "category_code",
        `actual entry ${row.id}`,
      ),
      actual_date: row.actual_date,
      description: row.description,
      amount: row.amount,
      planned_ref: row.planned_ref ?? "",
      notes: row.notes,
      auxiliary_labels: classificationNames.join("actual_entry", row.id, "auxiliary"),
    })),
  };
}
