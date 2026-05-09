import {
  SIMPLE_WORKBOOK_HEADERS,
  SIMPLE_WORKBOOK_SHEET_NAMES,
  type SimpleWorkbookSheetName,
} from "../imports/simpleWorkbookContract";
import type { WorkbookCellValue, WorkbookRows, WorkbookSheetRow } from "./workbookRows";

const PREVIEW_ROW_LIMIT = 10;

type KeyedSheetName = "funds" | "categories" | "planned_items";

const WORKBOOK_KEY_FIELDS: {
  [K in KeyedSheetName]: string[];
} = {
  funds: ["fund_code"],
  categories: ["fund_code", "category_code"],
  planned_items: ["planned_ref"],
};

export type WorkbookChangeRow = {
  action: "added" | "updated" | "removed";
  key: string;
  label: string;
  fields: string[];
};

export type WorkbookSheetDiff = {
  added: number;
  updated: number;
  removed: number;
  rows: WorkbookChangeRow[];
  more_count: number;
};

export type WorkbookDiffSummary = {
  [K in SimpleWorkbookSheetName]: WorkbookSheetDiff;
};

function serializeCell(value: WorkbookCellValue) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function buildRowKey(sheetName: KeyedSheetName, row: WorkbookSheetRow) {
  const key = WORKBOOK_KEY_FIELDS[sheetName]
    .map((field) => serializeCell(row[field] ?? ""))
    .join("\u0000");

  if (key === "") {
    throw new Error(`Missing workbook diff key for ${sheetName}`);
  }

  return key;
}

function buildRowLabel(sheetName: SimpleWorkbookSheetName, row: WorkbookSheetRow) {
  switch (sheetName) {
    case "funds":
      return serializeCell(row.name);
    case "categories":
      return serializeCell(row.name);
    case "budget_lines":
      return `${serializeCell(row.fund_code)}/${serializeCell(row.category_code)}`;
    case "planned_items":
      return serializeCell(row.description);
    case "actual_entries":
      return serializeCell(row.description);
  }
}

function createEmptySheetDiff(): WorkbookSheetDiff {
  return {
    added: 0,
    updated: 0,
    removed: 0,
    rows: [],
    more_count: 0,
  };
}

export function createEmptyWorkbookDiffSummary(): WorkbookDiffSummary {
  return Object.fromEntries(
    SIMPLE_WORKBOOK_SHEET_NAMES.map((sheetName) => [sheetName, createEmptySheetDiff()]),
  ) as WorkbookDiffSummary;
}

function buildRowMap(sheetName: KeyedSheetName, rows: WorkbookSheetRow[]) {
  const rowMap = new Map<string, WorkbookSheetRow>();

  for (const row of rows) {
    const key = buildRowKey(sheetName, row);
    if (rowMap.has(key)) {
      throw new Error(`Duplicate ${sheetName} key: ${key}`);
    }
    rowMap.set(key, row);
  }

  return rowMap;
}

function changedFields(
  sheetName: KeyedSheetName,
  currentRow: WorkbookSheetRow,
  generatedRow: WorkbookSheetRow,
) {
  return SIMPLE_WORKBOOK_HEADERS[sheetName].filter(
    (field) =>
      !WORKBOOK_KEY_FIELDS[sheetName].includes(field) &&
      serializeCell(currentRow[field]) !== serializeCell(generatedRow[field]),
  );
}

function buildRowFingerprint(sheetName: SimpleWorkbookSheetName, row: WorkbookSheetRow) {
  return SIMPLE_WORKBOOK_HEADERS[sheetName]
    .map((field) => serializeCell(row[field] ?? ""))
    .join("\u0000");
}

function pushLimitedChange(
  changes: WorkbookChangeRow[],
  action: WorkbookChangeRow["action"],
  key: string,
  label: string,
  fields: string[],
) {
  changes.push({ action, key, label, fields });
}

function summarizeChanges(changes: WorkbookChangeRow[]) {
  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const change of changes) {
    if (change.action === "added") {
      added += 1;
    } else if (change.action === "updated") {
      updated += 1;
    } else {
      removed += 1;
    }
  }

  return {
    added,
    updated,
    removed,
    rows: changes.slice(0, PREVIEW_ROW_LIMIT),
    more_count: Math.max(changes.length - PREVIEW_ROW_LIMIT, 0),
  };
}

function diffKeyedRows(
  sheetName: KeyedSheetName,
  currentRows: WorkbookSheetRow[],
  generatedRows: WorkbookSheetRow[],
) {
  const currentMap = buildRowMap(sheetName, currentRows);
  const generatedMap = buildRowMap(sheetName, generatedRows);
  const allKeys = [...new Set([...currentMap.keys(), ...generatedMap.keys()])].sort();
  const changes: WorkbookChangeRow[] = [];

  for (const key of allKeys) {
    const currentRow = currentMap.get(key);
    const generatedRow = generatedMap.get(key);

    if (!currentRow && generatedRow) {
      pushLimitedChange(changes, "added", key, buildRowLabel(sheetName, generatedRow), []);
      continue;
    }

    if (currentRow && !generatedRow) {
      pushLimitedChange(changes, "removed", key, buildRowLabel(sheetName, currentRow), []);
      continue;
    }

    if (currentRow && generatedRow) {
      const fields = changedFields(sheetName, currentRow, generatedRow);
      if (fields.length > 0) {
        pushLimitedChange(changes, "updated", key, buildRowLabel(sheetName, generatedRow), fields);
      }
    }
  }

  return summarizeChanges(changes);
}

function buildFingerprintRows(
  sheetName: SimpleWorkbookSheetName,
  rows: WorkbookSheetRow[],
) {
  const rowMap = new Map<string, WorkbookSheetRow[]>();

  for (const row of rows) {
    const fingerprint = buildRowFingerprint(sheetName, row);
    const bucket = rowMap.get(fingerprint);
    if (bucket) {
      bucket.push(row);
      continue;
    }

    rowMap.set(fingerprint, [row]);
  }

  return rowMap;
}

function diffMultisetRows(
  sheetName: SimpleWorkbookSheetName,
  currentRows: WorkbookSheetRow[],
  generatedRows: WorkbookSheetRow[],
) {
  const currentMap = buildFingerprintRows(sheetName, currentRows);
  const generatedMap = buildFingerprintRows(sheetName, generatedRows);
  const allFingerprints = [...new Set([...currentMap.keys(), ...generatedMap.keys()])].sort();
  const changes: WorkbookChangeRow[] = [];

  for (const fingerprint of allFingerprints) {
    const currentBucket = currentMap.get(fingerprint) ?? [];
    const generatedBucket = generatedMap.get(fingerprint) ?? [];

    if (generatedBucket.length > currentBucket.length) {
      const addedRows = generatedBucket.slice(currentBucket.length);
      for (let index = 0; index < addedRows.length; index += 1) {
        pushLimitedChange(
          changes,
          "added",
          `${fingerprint}\u0000added\u0000${index}`,
          buildRowLabel(sheetName, addedRows[index]),
          [],
        );
      }
    }

    if (currentBucket.length > generatedBucket.length) {
      const removedRows = currentBucket.slice(generatedBucket.length);
      for (let index = 0; index < removedRows.length; index += 1) {
        pushLimitedChange(
          changes,
          "removed",
          `${fingerprint}\u0000removed\u0000${index}`,
          buildRowLabel(sheetName, removedRows[index]),
          [],
        );
      }
    }
  }

  return summarizeChanges(changes);
}

export function diffWorkbookRows(
  currentRows: WorkbookRows,
  generatedRows: WorkbookRows,
): WorkbookDiffSummary {
  const summary = createEmptyWorkbookDiffSummary();

  for (const sheetName of SIMPLE_WORKBOOK_SHEET_NAMES) {
    if (sheetName === "funds" || sheetName === "categories" || sheetName === "planned_items") {
      summary[sheetName] = diffKeyedRows(sheetName, currentRows[sheetName], generatedRows[sheetName]);
      continue;
    }

    summary[sheetName] = diffMultisetRows(sheetName, currentRows[sheetName], generatedRows[sheetName]);
  }

  return summary;
}
