export const queryKeys = {
  overview: {
    all: ["overview"] as const,
    detail: (fiscalYear?: number) => ["overview", fiscalYear ?? "auto"] as const,
    monthlySummary: (fiscalYear: number, month: string) => ["overview", "monthly-summary", fiscalYear, month] as const,
  },
  fiscalYearComparison: {
    all: ["fiscal-year-comparison"] as const,
  },
  fund: {
    detail: (fundId: number) => ["fund", fundId] as const,
    categoryOptions: (fundId: number | null) => ["fund-category-options", fundId] as const,
  },
  classifications: { all: ["classifications"] as const },
};
