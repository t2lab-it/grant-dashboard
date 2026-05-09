export const CROSS_AGGREGATE_CATEGORY_CODES = [
  "equipment",
  "travel",
  "personnel",
  "other",
  "unset",
] as const;

export type CrossAggregateCategory = (typeof CROSS_AGGREGATE_CATEGORY_CODES)[number];

export const CROSS_AGGREGATE_CATEGORY_LABELS: Record<CrossAggregateCategory, string> = {
  equipment: "物品系",
  travel: "旅費系",
  personnel: "人件費・謝金系",
  other: "その他",
  unset: "未設定",
};

export function isCrossAggregateCategory(value: string): value is CrossAggregateCategory {
  return CROSS_AGGREGATE_CATEGORY_CODES.includes(value as CrossAggregateCategory);
}
