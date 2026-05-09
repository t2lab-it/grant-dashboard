import type { CrossAggregateCategory } from "../../contracts/crossAggregateCategory";

export type OverviewChartFund = {
  name: string;
  awarded_amount: number;
  committed_amount: number;
  actual_amount: number;
  freeBalance: number;
};

export type OverviewChartSegment = {
  label: "執行済" | "執行予定" | "残高";
  percentage: number;
  color: string;
  borderColor?: string;
  isNegative?: boolean;
};

export type OverBudgetChartState = {
  overBudgetAmount: number;
  overBudgetPercentage: number;
};

export type OverviewChartPresetKey = "blue-orange" | "teal-yellow" | "gray-sky";
export type OverviewChartPresetRef = OverviewChartPresetKey | `custom:${string}`;

export const defaultOverviewChartPreset: OverviewChartPresetKey = "teal-yellow";
export const overviewChartPresetOrder: OverviewChartPresetKey[] = [
  "teal-yellow",
  "blue-orange",
  "gray-sky",
];

export type OverviewChartPalette = {
  actual: string;
  committed: string;
  balance: string;
  balanceBorder: string;
};

export type CrossAggregateChartColors = Record<CrossAggregateCategory, string>;

export type CustomOverviewChartPreset = {
  id: string;
  label: string;
  palette: OverviewChartPalette;
};

export const overviewChartPresets: Record<
  OverviewChartPresetKey,
  { label: string; palette: OverviewChartPalette }
> = {
  "blue-orange": {
    label: "青＋オレンジ系",
    palette: {
      actual: "#2C5AA0",
      committed: "#FF8C42",
      balance: "#F8F7F4",
      balanceBorder: "#E7E2DB",
    },
  },
  "teal-yellow": {
    label: "青緑＋黄色系",
    palette: {
      actual: "#26A69A",
      committed: "#FFD54F",
      balance: "#F8F7F4",
      balanceBorder: "#E7E2DB",
    },
  },
  "gray-sky": {
    label: "グレー＋水色系",
    palette: {
      actual: "#4D4D4D",
      committed: "#4FC3F7",
      balance: "#F8F7F4",
      balanceBorder: "#E7E2DB",
    },
  },
};

export function getOverviewChartPresetKey(
  value: string | null | undefined,
  fallback: OverviewChartPresetKey = defaultOverviewChartPreset,
): OverviewChartPresetKey {
  if (value && value in overviewChartPresets) {
    return value as OverviewChartPresetKey;
  }

  return fallback;
}

export function isOverviewChartPresetKey(value: string | null | undefined): value is OverviewChartPresetKey {
  return Boolean(value && value in overviewChartPresets);
}

export function isValidChartHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeCustomPresetId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]{1,64}$/.test(trimmed) ? trimmed : null;
}

function normalizeCustomPresetLabel(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 40 ? trimmed : null;
}

function normalizePalette(value: unknown): OverviewChartPalette | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const palette = value as Partial<Record<keyof OverviewChartPalette, unknown>>;
  if (
    !isValidChartHexColor(palette.actual) ||
    !isValidChartHexColor(palette.committed) ||
    !isValidChartHexColor(palette.balance) ||
    !isValidChartHexColor(palette.balanceBorder)
  ) {
    return null;
  }

  return {
    actual: palette.actual.toLowerCase(),
    committed: palette.committed.toLowerCase(),
    balance: palette.balance.toLowerCase(),
    balanceBorder: palette.balanceBorder.toLowerCase(),
  };
}

export function normalizeCustomOverviewChartPresets(value: unknown): CustomOverviewChartPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set<string>();
  const presets: CustomOverviewChartPreset[] = [];
  value.forEach((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      return;
    }

    const rawPreset = candidate as {
      id?: unknown;
      label?: unknown;
      palette?: unknown;
    };
    const id = normalizeCustomPresetId(rawPreset.id);
    const label = normalizeCustomPresetLabel(rawPreset.label);
    const palette = normalizePalette(rawPreset.palette);
    if (!id || !label || !palette || seenIds.has(id)) {
      return;
    }

    seenIds.add(id);
    presets.push({ id, label, palette });
  });

  return presets;
}

export function customOverviewChartPresetRef(id: string): OverviewChartPresetRef {
  return `custom:${id}`;
}

export function getCustomOverviewChartPresetId(value: string | null | undefined) {
  return value?.startsWith("custom:") ? value.slice("custom:".length) : null;
}

export function getOverviewChartPresetRef(
  value: string | null | undefined,
  customPresets: CustomOverviewChartPreset[],
  fallback: OverviewChartPresetKey = defaultOverviewChartPreset,
): OverviewChartPresetRef {
  if (isOverviewChartPresetKey(value)) {
    return value;
  }

  const customId = getCustomOverviewChartPresetId(value);
  if (customId && customPresets.some((preset) => preset.id === customId)) {
    return customOverviewChartPresetRef(customId);
  }

  return fallback;
}

export function getOverviewChartPalette(
  presetRef: OverviewChartPresetRef,
  customPresets: CustomOverviewChartPreset[],
): OverviewChartPalette {
  const customId = getCustomOverviewChartPresetId(presetRef);
  const customPreset = customId
    ? customPresets.find((preset) => preset.id === customId)
    : undefined;
  if (customPreset) {
    return customPreset.palette;
  }

  const presetKey = isOverviewChartPresetKey(presetRef) ? presetRef : defaultOverviewChartPreset;
  return overviewChartPresets[presetKey].palette;
}

function resolveOverviewChartPalette(value: OverviewChartPalette | OverviewChartPresetKey) {
  return typeof value === "string" ? overviewChartPresets[value].palette : value;
}

function hexToRgb(hexColor: string) {
  const normalized = hexColor.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
}

function rgbToHex({ red, green, blue }: { red: number; green: number; blue: number }) {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function mixHexColors(leftColor: string, rightColor: string) {
  const left = hexToRgb(leftColor);
  const right = hexToRgb(rightColor);

  return rgbToHex({
    red: Math.round((left.red + right.red) / 2),
    green: Math.round((left.green + right.green) / 2),
    blue: Math.round((left.blue + right.blue) / 2),
  });
}

export function getCrossAggregateChartColors(palette: OverviewChartPalette): CrossAggregateChartColors {
  return {
    equipment: palette.actual,
    travel: palette.committed,
    personnel: palette.balanceBorder,
    other: mixHexColors(palette.actual, palette.committed),
    unset: mixHexColors(palette.balanceBorder, "#64748b"),
  };
}

export function createOverviewChartSegments(
  fund: OverviewChartFund,
  preset: OverviewChartPalette | OverviewChartPresetKey,
): OverviewChartSegment[] {
  const committedAmount = Math.max(fund.committed_amount, 0);
  const actualAmount = Math.max(fund.actual_amount, 0);
  const balanceAmount = Math.max(fund.freeBalance, 0);
  const total = committedAmount + actualAmount + balanceAmount;
  const denominator = total > 0 ? total : 1;
  const palette = resolveOverviewChartPalette(preset);

  return [
    {
      label: "執行済",
      percentage: (actualAmount / denominator) * 100,
      color: palette.actual,
    },
    {
      label: "執行予定",
      percentage: (committedAmount / denominator) * 100,
      color: palette.committed,
    },
    {
      label: "残高",
      percentage: (balanceAmount / denominator) * 100,
      color: palette.balance,
      borderColor: palette.balanceBorder,
      isNegative: fund.freeBalance < 0,
    },
  ];
}

export function getOverBudgetChartState(
  awardedAmount: number,
  freeBalance: number,
): OverBudgetChartState {
  const overBudgetAmount = freeBalance < 0 ? Math.abs(freeBalance) : 0;

  if (overBudgetAmount === 0) {
    return {
      overBudgetAmount: 0,
      overBudgetPercentage: 0,
    };
  }

  if (awardedAmount <= 0) {
    return {
      overBudgetAmount,
      overBudgetPercentage: 100,
    };
  }

  return {
    overBudgetAmount,
    overBudgetPercentage: Math.min((overBudgetAmount / awardedAmount) * 100, 100),
  };
}
