import { formatAmount, type AmountDisplayMode } from "../../lib/format";
import {
  createOverviewChartSegments,
  getOverBudgetChartState,
  getOverviewChartPresetKey,
  overviewChartPresets,
  type OverviewChartPalette,
  type OverviewChartPresetKey,
} from "../overview/overviewChart";

const innerChartBasePalettes: Record<
  OverviewChartPresetKey,
  { planned: string; actual: string; balance: string; balanceBorder: string }
> = {
  "blue-orange": {
    planned: "#C2410C",
    actual: "#0F766E",
    balance: "#EEF3F8",
    balanceBorder: "#D5DFE9",
  },
  "teal-yellow": {
    planned: "#DD6B20",
    actual: "#1D4ED8",
    balance: "#F0F4F8",
    balanceBorder: "#D7E0EA",
  },
  "gray-sky": {
    planned: "#E76F51",
    actual: "#4338CA",
    balance: "#F1F4F9",
    balanceBorder: "#D8E0EA",
  },
};

type FundDetailCategory = {
  id: number;
  categoryName: string;
  plannedAmount: number;
  actualAmount: number;
};

export type FundDetailChartSegment = {
  key: string;
  label: string;
  amount: number;
  percentage: number;
  color: string;
  borderColor?: string;
};

export type FundDetailChartData = {
  innerRingSegments: FundDetailChartSegment[];
  outerRingSegments: FundDetailChartSegment[];
  legendSegments: FundDetailChartSegment[];
  plannedAmount: number;
  actualAmount: number;
  freeBalance: number;
  overBudgetAmount: number;
  overBudgetPercentage: number;
  accessibleSummary: string;
};

export type FundDetailChartPalette = {
  overview: OverviewChartPalette;
  detail: {
    planned: string;
    actual: string;
    balance: string;
    balanceBorder: string;
  };
};

function hexToRgb(hexColor: string) {
  const normalized = hexColor.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHsl(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { hue: 0, saturation: 0, lightness: lightness * 100 };
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue = 0;
  if (max === r) {
    hue = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return {
    hue: hue * 60,
    saturation: saturation * 100,
    lightness: lightness * 100,
  };
}

function normalizeHue(hue: number) {
  return ((hue % 360) + 360) % 360;
}

function toHslColor(hue: number, saturation: number, lightness: number) {
  return `hsl(${Math.round(normalizeHue(hue))} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

function createHueShiftSeries(baseColor: string, count: number, kind: "planned" | "actual") {
  if (count <= 1) {
    return [baseColor];
  }

  const { r, g, b } = hexToRgb(baseColor);
  const base = rgbToHsl(r, g, b);
  const hueSpan = kind === "planned" ? 58 : 72;
  const saturationBoost = kind === "planned" ? 10 : 8;
  const lightnessSpread = kind === "planned" ? 18 : 20;

  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    const hueOffset = -hueSpan / 2 + hueSpan * ratio;
    const lightness =
      base.lightness + lightnessSpread / 2 - lightnessSpread * ratio;
    const saturation = Math.min(100, base.saturation + saturationBoost - Math.abs(0.5 - ratio) * 10);

    return toHslColor(base.hue + hueOffset, saturation, lightness);
  });
}

export function createFundDetailChartData(
  categories: FundDetailCategory[],
  awardedAmount: number,
  preset: OverviewChartPresetKey,
  amountDisplayMode: AmountDisplayMode,
): FundDetailChartData {
  return createFundDetailChartDataWithPalettes(
    categories,
    awardedAmount,
    {
      overview: overviewChartPresets[preset].palette,
      detail: innerChartBasePalettes[preset],
    },
    amountDisplayMode,
  );
}

export function createFundDetailChartDataForPalette(
  categories: FundDetailCategory[],
  awardedAmount: number,
  palette: OverviewChartPalette,
  amountDisplayMode: AmountDisplayMode,
): FundDetailChartData {
  return createFundDetailChartDataWithPalettes(
    categories,
    awardedAmount,
    {
      overview: palette,
      detail: {
        planned: palette.committed,
        actual: palette.actual,
        balance: palette.balance,
        balanceBorder: palette.balanceBorder,
      },
    },
    amountDisplayMode,
  );
}

export function createFundDetailChartDataWithPalettes(
  categories: FundDetailCategory[],
  awardedAmount: number,
  palette: FundDetailChartPalette,
  amountDisplayMode: AmountDisplayMode,
): FundDetailChartData {
  const innerPalette = palette.detail;
  const plannedSegmentsBase = categories.filter((category) => category.plannedAmount > 0);
  const actualSegmentsBase = categories.filter((category) => category.actualAmount > 0);
  const plannedColors = createHueShiftSeries(innerPalette.planned, plannedSegmentsBase.length, "planned");
  const actualColors = createHueShiftSeries(innerPalette.actual, actualSegmentsBase.length, "actual");
  const plannedAmount = plannedSegmentsBase.reduce((sum, category) => sum + category.plannedAmount, 0);
  const actualAmount = actualSegmentsBase.reduce((sum, category) => sum + category.actualAmount, 0);
  const freeBalance = awardedAmount - plannedAmount - actualAmount;
  const { overBudgetAmount, overBudgetPercentage } = getOverBudgetChartState(awardedAmount, freeBalance);
  const balanceAmount = Math.max(freeBalance, 0);
  const denominator = plannedAmount + actualAmount + balanceAmount > 0 ? plannedAmount + actualAmount + balanceAmount : 1;

  const plannedSegments = plannedSegmentsBase.map((category, index) => ({
    key: `planned-${category.id}`,
    label: `${category.categoryName} 執行予定`,
    amount: category.plannedAmount,
    percentage: (category.plannedAmount / denominator) * 100,
    color: plannedColors[index],
  }));
  const actualSegments = actualSegmentsBase.map((category, index) => ({
    key: `actual-${category.id}`,
    label: `${category.categoryName} 執行済`,
    amount: category.actualAmount,
    percentage: (category.actualAmount / denominator) * 100,
    color: actualColors[index],
  }));
  const balanceSegment =
    balanceAmount > 0
      ? {
          key: "balance",
          label: "残高",
          amount: balanceAmount,
          percentage: (balanceAmount / denominator) * 100,
          color: innerPalette.balance,
          borderColor: innerPalette.balanceBorder,
        }
      : null;

  const innerRingSegments = createOverviewChartSegments(
    {
      name: "",
      awarded_amount: awardedAmount,
      committed_amount: plannedAmount,
      actual_amount: actualAmount,
      freeBalance,
    },
    palette.overview,
  ).map((segment) => ({
    key: segment.label,
    label: segment.label,
    amount:
      segment.label === "執行予定"
        ? plannedAmount
        : segment.label === "執行済"
          ? actualAmount
          : freeBalance,
    percentage: segment.percentage,
    color: segment.color,
    borderColor: segment.borderColor,
  }));

  const outerRingSegments = balanceSegment
    ? [...actualSegments, ...plannedSegments, balanceSegment]
    : [...actualSegments, ...plannedSegments];
  const accessibleSummaryParts = [
    `執行予定 ${formatAmount(plannedAmount, amountDisplayMode)}`,
    `執行済 ${formatAmount(actualAmount, amountDisplayMode)}`,
    `残高 ${formatAmount(freeBalance, amountDisplayMode)}`,
  ];

  outerRingSegments.forEach((segment) => {
    accessibleSummaryParts.push(`${segment.label} ${formatAmount(segment.amount, amountDisplayMode)}`);
  });

  return {
    innerRingSegments,
    outerRingSegments,
    legendSegments: outerRingSegments,
    plannedAmount,
    actualAmount,
    freeBalance,
    overBudgetAmount,
    overBudgetPercentage,
    accessibleSummary: accessibleSummaryParts.join("、"),
  };
}

export { getOverviewChartPresetKey };
