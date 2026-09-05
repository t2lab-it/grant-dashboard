import type Database from "better-sqlite3";
import type {
  ImportCounts,
  ImportWarning,
  ReconciliationMetricSet,
  WorkbookImportResult,
} from "../../src/contracts/imports";
import type { CrossAggregateCategory } from "../../src/contracts/crossAggregateCategory";
export type {
  ImportWarning,
  ImportWarningCode,
  PersistImportMode,
  ReconciliationComparison,
  ReconciliationFundComparison,
  ReconciliationMismatch,
  ReconciliationMetric,
  ReconciliationMetricSet,
  ReconciliationReport,
} from "../../src/contracts/imports";

export type ImportedFundDraft = {
  fund_code: string;
  name: string;
  fiscal_year: number;
  awarded_amount: number;
  notes: string;
  project_tag_names?: string[];
  auxiliary_label_names?: string[];
  display_order: number;
};

export type ImportedCategoryDraft = {
  fund_code: string;
  category_code: string;
  fund_name: string;
  name: string;
  cross_aggregate_category: CrossAggregateCategory;
  display_order: number;
};

export type ImportedBudgetLineDraft = {
  fund_code: string;
  category_code: string;
  fund_name: string;
  category_name: string;
  amount: number | null;
  notes: string;
};

export type ImportedPlannedItemDraft = {
  fund_code: string;
  category_code: string;
  planned_ref?: string | null;
  fund_name: string;
  category_name: string;
  planned_date: string;
  scheduled_month: string;
  description: string;
  amount: number;
  status: "planned";
  notes: string;
  auxiliary_label_names?: string[];
};

export type ImportedActualEntryDraft = {
  fund_code: string;
  category_code: string;
  planned_ref?: string | null;
  fund_name: string;
  category_name: string;
  planned_item_id: number | null;
  actual_date: string;
  description: string;
  amount: number;
  notes: string;
  auxiliary_label_names?: string[];
};

export type DryRunImportResult = {
  workbook_path: string;
  funds: ImportedFundDraft[];
  categories: ImportedCategoryDraft[];
  budget_lines: ImportedBudgetLineDraft[];
  planned_items: ImportedPlannedItemDraft[];
  actual_entries: ImportedActualEntryDraft[];
  warnings: ImportWarning[];
  counts: ImportCounts;
};

export type PersistWorkbookImportArgs = {
  db: Database.Database;
  dbPath: string;
  draft: DryRunImportResult;
  sourceFilename: string;
  importedAt: string;
  replace: boolean;
};

export type ReconciliationFundSnapshot = {
  fund_code: string;
  fund_name: string;
  assets: number;
  planned: number;
  actual: number;
  free_balance: number;
};

export type ReconciliationSnapshot = {
  overall: ReconciliationMetricSet;
  funds: ReconciliationFundSnapshot[];
};

export type PersistImportSummary = Pick<
  WorkbookImportResult,
  "import_id" | "mode" | "counts" | "warning_count_by_code"
>;
