export type ImportWarningCode =
  | "unsupported_row_pattern"
  | "negative_planned_adjustment"
  | "malformed_date"
  | "malformed_amount"
  | "unknown_category_mapping"
  | "unknown_month_mapping"
  | "unattachable_fund_or_sheet"
  | "missing_required_cell"
  | "null_budget_amount"
  | "unlinked_actual_entry";

export type ImportWarning = {
  code: ImportWarningCode;
  sheet_name: string;
  row_number: number;
  message: string;
};

export type ImportCounts = {
  funds: number;
  categories: number;
  budget_lines: number;
  planned_items: number;
  actual_entries: number;
  warnings: number;
};

export type PersistImportMode = "initial" | "replace";

export type StoredImportMappingSummary = {
  mode: PersistImportMode;
  counts: ImportCounts;
  warning_count_by_code: Partial<Record<ImportWarningCode, number>>;
};

export type ReconciliationMetric = "assets" | "planned" | "actual" | "free_balance";

export type ReconciliationMetricSet = {
  assets: number;
  planned: number;
  actual: number;
  free_balance: number;
};

export type ReconciliationComparison = {
  expected: ReconciliationMetricSet;
  actual: ReconciliationMetricSet;
};

export type ReconciliationFundComparison = {
  fund_code: string;
  fund_name: string;
  expected: ReconciliationMetricSet;
  actual: ReconciliationMetricSet;
};

export type ReconciliationOverallMismatch = {
  scope: "overall";
  fund_name?: never;
  metric: ReconciliationMetric;
  expected: number;
  actual: number;
  delta: number;
};

export type ReconciliationFundMismatch = {
  scope: "fund";
  fund_code: string;
  fund_name: string;
  metric: ReconciliationMetric;
  expected: number;
  actual: number;
  delta: number;
};

export type ReconciliationMismatch = ReconciliationOverallMismatch | ReconciliationFundMismatch;

export type ReconciliationReport = {
  workbook_path: string;
  db_path: string;
  ok: boolean;
  overall: ReconciliationComparison;
  funds: ReconciliationFundComparison[];
  mismatches: ReconciliationMismatch[];
};

export type WorkbookImportPreview = {
  source_filename: string;
  replace: true;
  counts: ImportCounts;
  warnings: ImportWarning[];
  demoImport: {
    eligible: boolean;
  };
};

export type WorkbookImportResult = {
  source_filename: string;
  workbook_path: string;
  import_id: number;
  mode: PersistImportMode;
  counts: ImportCounts;
  warning_count_by_code: Partial<Record<ImportWarningCode, number>>;
  demoImport: {
    eligible: boolean;
  };
};

export type ImportHistoryItem = {
  id: number;
  source_filename: string;
  imported_at: string;
  warning_count: number;
  reconciliation_ok: boolean;
  mapping_summary: StoredImportMappingSummary;
};

export type ImportHistoryResponse = ImportHistoryItem[];

export type ImportDetailResponse = {
  id: number;
  source_filename: string;
  imported_at: string;
  warning_count: number;
  mapping_summary: StoredImportMappingSummary;
  warnings: ImportWarning[];
  reconciliation: ReconciliationReport;
};
