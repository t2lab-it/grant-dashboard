import { OverviewPage, type OverviewResponse } from "../../src/features/overview/OverviewPage";
import { routes } from "../../src/app/routes";
import { fetchMock, renderWithAppRouter, renderWithMemoryRouter, resetClientTestState } from "./testUtils";
import { vi } from "vitest";

export { fetchMock };

let hoverCapablePointer = false;

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: query === "(hover: hover) and (pointer: fine)" ? hoverCapablePointer : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

export function setHoverCapablePointer(value: boolean) {
  hoverCapablePointer = value;
}

export function resetOverviewTestState() {
  resetClientTestState();
  hoverCapablePointer = false;
}

export function renderOverviewPage() {
  return renderWithMemoryRouter(<OverviewPage />);
}

export function renderAppRoute(initialEntry: string) {
  return renderWithAppRouter(routes, initialEntry);
}

type OverviewTotals = {
  assets: number;
  committed: number;
  actual: number;
  freeBalance: number;
};

type OverviewLatestImport = {
  id: number;
  source_filename: string;
  imported_at: string;
  warning_count: number;
  reconciliation_ok: boolean;
};

type OverviewMonthlyStatus = Array<{
  month: string;
  committed: number;
  actual: number;
  balance: number;
}>;

type OverviewYearEndRisk = {
  plannedBalance: number;
  riskFundCount: number;
  risks: Array<{
    fundId: number;
    fundName: string;
    awardedAmount: number;
    plannedBalance: number;
    plannedBalanceRate: number | null;
    overduePlannedAmount: number;
    riskKinds: Array<"overdue_planned" | "excess_balance" | "low_balance" | "negative_balance">;
  }>;
};

type OverviewResponseFund = OverviewResponse["funds"][number];

type OverviewCrossAggregateCategory = {
  crossAggregateCategory: "equipment" | "travel" | "personnel" | "other" | "unset";
  budgetAmount: number | null;
  plannedAmount: number;
  actualAmount: number;
};

type OverviewResponseOverrides = {
  availableFiscalYears?: number[];
  selectedFiscalYear?: number | null;
  totals?: Partial<OverviewTotals>;
  monthlyStatus?: OverviewMonthlyStatus;
  linkedActualAmount?: number;
  pendingPlannedCount?: number;
  yearEndRisk?: OverviewYearEndRisk;
  latestImport?: OverviewLatestImport | null;
  funds?: OverviewResponseFund[];
  crossAggregateCategories?: OverviewCrossAggregateCategory[];
  tutorial?: {
    eligibleDemoData: boolean;
  };
};

export function buildOverviewFund(
  overrides: Partial<OverviewResponseFund> = {},
): OverviewResponseFund {
  return {
    id: 1,
    name: "基盤研究費",
    awarded_amount: 1000000,
    committed_amount: 700000,
    actual_amount: 400000,
    freeBalance: -100000,
    projectTags: [],
    ...overrides,
  };
}

export function buildOverviewResponse(
  overrides: OverviewResponseOverrides = {},
): OverviewResponse {
  return {
    availableFiscalYears: overrides.availableFiscalYears ?? [2026],
    selectedFiscalYear: overrides.selectedFiscalYear ?? 2026,
    totals: {
      assets: 10246706,
      committed: 7087000,
      actual: 0,
      freeBalance: 3159706,
      ...overrides.totals,
    },
    monthlyStatus: overrides.monthlyStatus ?? [],
    linkedActualAmount: overrides.linkedActualAmount ?? 0,
    pendingPlannedCount: overrides.pendingPlannedCount ?? 0,
    yearEndRisk: overrides.yearEndRisk ?? {
      plannedBalance: overrides.totals?.freeBalance ?? 3159706,
      riskFundCount: 0,
      risks: [],
    },
    latestImport:
      overrides.latestImport === undefined ? null : overrides.latestImport,
    crossAggregateCategories: overrides.crossAggregateCategories ?? [],
    tutorial: overrides.tutorial ?? { eligibleDemoData: false },
    funds:
      overrides.funds ??
      [
        buildOverviewFund(),
        buildOverviewFund({
          id: 2,
          name: "ACT-X",
          awarded_amount: 5080000,
          committed_amount: 4685000,
          actual_amount: 47590,
          freeBalance: 347410,
        }),
      ],
  };
}

export function mockOverviewResponse(
  overrides: OverviewResponseOverrides = {},
) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => buildOverviewResponse(overrides),
  });
}
