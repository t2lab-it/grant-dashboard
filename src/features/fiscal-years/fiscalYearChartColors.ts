const FUND_COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ab",
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#17becf",
] as const;

export const FISCAL_YEAR_MONTH_LABELS = [
  "4月", "5月", "6月", "7月", "8月", "9月",
  "10月", "11月", "12月", "1月", "2月", "3月",
] as const;

// Twelve evenly ordered samples from Viridis, a perceptually uniform sequential map.
export const FISCAL_YEAR_MONTH_COLORS = [
  "#440154", "#482173", "#433e85", "#38588c", "#2d708e", "#25858e",
  "#1e9b8a", "#2ab07f", "#51c56a", "#86d549", "#c2df23", "#fde725",
] as const;

export function colorForFiscalYearFund(colorIndex: number) {
  return FUND_COLORS[colorIndex % FUND_COLORS.length];
}
