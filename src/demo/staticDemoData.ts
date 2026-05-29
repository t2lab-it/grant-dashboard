import actualEntries from "../../seeds/demo/actual_entries.json";
import budgetLines from "../../seeds/demo/budget_lines.json";
import categories from "../../seeds/demo/categories.json";
import classificationAssignments from "../../seeds/demo/classification_assignments.json";
import classificationTags from "../../seeds/demo/classification_tags.json";
import funds from "../../seeds/demo/funds.json";
import plannedItems from "../../seeds/demo/planned_items.json";
import type { CrossAggregateCategory } from "../contracts/crossAggregateCategory";

export type StaticDemoFund = {
  id: number;
  fund_code: string | null;
  name: string;
  fiscal_year: number;
  awarded_amount: number;
  notes: string;
  display_order: number;
};

export type StaticDemoCategory = {
  id: number;
  fund_id: number;
  category_code: string | null;
  name: string;
  cross_aggregate_category: CrossAggregateCategory;
  display_order: number;
};

export type StaticDemoBudgetLine = {
  id: number;
  fund_id: number;
  category_id: number;
  amount: number | null;
  notes: string;
};

export type StaticDemoPlannedItem = {
  id: number;
  fund_id: number;
  category_id: number;
  planned_ref: string | null;
  planned_date: string;
  scheduled_month: string;
  description: string;
  amount: number;
  status: "planned" | "completed" | "cancelled";
  notes: string;
};

export type StaticDemoActualEntry = {
  id: number;
  fund_id: number;
  category_id: number;
  planned_item_id: number | null;
  actual_date: string;
  description: string;
  amount: number;
  notes: string;
};

export type StaticDemoClassificationTag = {
  id: number;
  kind: "project" | "auxiliary";
  name: string;
  color: string;
};

export type StaticDemoClassificationAssignment = {
  tag_id: number;
  target_type: "fund" | "planned_item" | "actual_entry";
  target_id: number;
};

export type StaticDemoState = {
  funds: StaticDemoFund[];
  categories: StaticDemoCategory[];
  budget_lines: StaticDemoBudgetLine[];
  planned_items: StaticDemoPlannedItem[];
  actual_entries: StaticDemoActualEntry[];
  classification_tags: StaticDemoClassificationTag[];
  classification_assignments: StaticDemoClassificationAssignment[];
};

export const staticDemoSeedState: StaticDemoState = {
  funds: funds as StaticDemoFund[],
  categories: categories as StaticDemoCategory[],
  budget_lines: budgetLines as StaticDemoBudgetLine[],
  planned_items: plannedItems as StaticDemoPlannedItem[],
  actual_entries: actualEntries as StaticDemoActualEntry[],
  classification_tags: classificationTags as StaticDemoClassificationTag[],
  classification_assignments: classificationAssignments as StaticDemoClassificationAssignment[],
};

export function cloneStaticDemoSeedState(): StaticDemoState {
  return structuredClone(staticDemoSeedState);
}
