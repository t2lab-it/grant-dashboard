import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  defaultOverviewChartPreset,
  getCustomOverviewChartPresetId,
  type CustomOverviewChartPreset,
  type OverviewChartPresetRef,
} from "../overview/overviewChart";
import {
  defaultBalanceRateThresholds,
  defaultExecutionRateThresholds,
  type BalanceRateThresholds,
  type ExecutionRateThresholds,
  type RateMetricKey,
} from "../../lib/executionRate";
import { type AmountDisplayMode } from "../../lib/format";
import {
  defaultFundDetailSectionOrder,
  type FundDetailSectionKey,
} from "./fundDetailSectionOrder";

export const APP_SETTINGS_STORAGE_KEY = "budget-dashboard:settings";
export const defaultOverviewDisplayMode = "chart";
export const defaultNotesDisplayMode = "hover";
export const defaultAmountDisplayMode: AmountDisplayMode = "grouped-yen";

export type AppThemeMode = "system" | "light" | "dark";
export type OverviewDisplayMode = "chart" | "numeric";
export type NotesDisplayMode = "hover" | "click" | "expanded";

type AppSettings = {
  appThemeMode: AppThemeMode;
  themePreset: OverviewChartPresetRef;
  customChartPresets: CustomOverviewChartPreset[];
  defaultRateMetric: RateMetricKey;
  defaultOverviewDisplayMode: OverviewDisplayMode;
  notesDisplayMode: NotesDisplayMode;
  defaultFundId: number | null;
  defaultCategoryId: number | null;
  amountDisplayMode: AmountDisplayMode;
  fundDetailSectionOrder: FundDetailSectionKey[];
  executionRateThresholds: ExecutionRateThresholds;
  balanceRateThresholds: BalanceRateThresholds;
};

type AppSettingsContextValue = {
  settings: AppSettings;
  setAppThemeMode: (mode: AppThemeMode) => void;
  setThemePreset: (themePreset: OverviewChartPresetRef) => void;
  saveCustomChartPreset: (preset: CustomOverviewChartPreset) => void;
  deleteCustomChartPreset: (id: string) => void;
  setDefaultRateMetric: (metric: RateMetricKey) => void;
  setDefaultOverviewDisplayMode: (displayMode: OverviewDisplayMode) => void;
  setNotesDisplayMode: (displayMode: NotesDisplayMode) => void;
  setDefaultFundId: (fundId: number | null) => void;
  setDefaultCategoryId: (categoryId: number | null) => void;
  setAmountDisplayMode: (displayMode: AmountDisplayMode) => void;
  setFundDetailSectionOrder: (sectionOrder: FundDetailSectionKey[]) => void;
  setExecutionRateThresholds: (thresholds: ExecutionRateThresholds) => void;
  setBalanceRateThresholds: (thresholds: BalanceRateThresholds) => void;
  resetExecutionRateThresholds: () => void;
  resetBalanceRateThresholds: () => void;
};

const defaultSettings: AppSettings = {
  appThemeMode: "system",
  themePreset: defaultOverviewChartPreset,
  customChartPresets: [],
  defaultRateMetric: "execution",
  defaultOverviewDisplayMode,
  notesDisplayMode: defaultNotesDisplayMode,
  defaultFundId: null,
  defaultCategoryId: null,
  amountDisplayMode: defaultAmountDisplayMode,
  fundDetailSectionOrder: defaultFundDetailSectionOrder,
  executionRateThresholds: defaultExecutionRateThresholds,
  balanceRateThresholds: defaultBalanceRateThresholds,
};

const AppSettingsContext = createContext<AppSettingsContextValue>({
  settings: defaultSettings,
  setAppThemeMode: () => undefined,
  setThemePreset: () => undefined,
  saveCustomChartPreset: () => undefined,
  deleteCustomChartPreset: () => undefined,
  setDefaultRateMetric: () => undefined,
  setDefaultOverviewDisplayMode: () => undefined,
  setNotesDisplayMode: () => undefined,
  setDefaultFundId: () => undefined,
  setDefaultCategoryId: () => undefined,
  setAmountDisplayMode: () => undefined,
  setFundDetailSectionOrder: () => undefined,
  setExecutionRateThresholds: () => undefined,
  setBalanceRateThresholds: () => undefined,
  resetExecutionRateThresholds: () => undefined,
  resetBalanceRateThresholds: () => undefined,
});

function readStoredSettings(): AppSettings {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  const rawValue = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (!rawValue) {
    return defaultSettings;
  }

  return JSON.parse(rawValue) as AppSettings;
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => readStoredSettings());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      settings,
      setAppThemeMode: (appThemeMode) =>
        setSettings((current) => ({ ...current, appThemeMode })),
      setThemePreset: (themePreset) => setSettings((current) => ({ ...current, themePreset })),
      saveCustomChartPreset: (preset) =>
        setSettings((current) => {
          const customChartPresets = [
            ...current.customChartPresets.filter((candidate) => candidate.id !== preset.id),
            preset,
          ];
          return { ...current, customChartPresets };
        }),
      deleteCustomChartPreset: (id) =>
        setSettings((current) => {
          const customChartPresets = current.customChartPresets.filter((preset) => preset.id !== id);
          return {
            ...current,
            customChartPresets,
            themePreset:
              getCustomOverviewChartPresetId(current.themePreset) === id
                ? defaultOverviewChartPreset
                : current.themePreset,
          };
        }),
      setDefaultRateMetric: (defaultRateMetric) =>
        setSettings((current) => ({ ...current, defaultRateMetric })),
      setDefaultOverviewDisplayMode: (defaultOverviewDisplayMode) =>
        setSettings((current) => ({ ...current, defaultOverviewDisplayMode })),
      setNotesDisplayMode: (notesDisplayMode) =>
        setSettings((current) => ({ ...current, notesDisplayMode })),
      setDefaultFundId: (defaultFundId) =>
        setSettings((current) => ({
          ...current,
          defaultFundId,
          defaultCategoryId:
            defaultFundId === null || current.defaultFundId !== defaultFundId
              ? null
              : current.defaultCategoryId,
        })),
      setDefaultCategoryId: (defaultCategoryId) =>
        setSettings((current) => ({ ...current, defaultCategoryId })),
      setAmountDisplayMode: (amountDisplayMode) =>
        setSettings((current) => ({ ...current, amountDisplayMode })),
      setFundDetailSectionOrder: (fundDetailSectionOrder) =>
        setSettings((current) => ({
          ...current,
          fundDetailSectionOrder,
        })),
      setExecutionRateThresholds: (executionRateThresholds) =>
        setSettings((current) => ({
          ...current,
          executionRateThresholds,
        })),
      setBalanceRateThresholds: (balanceRateThresholds) =>
        setSettings((current) => ({
          ...current,
          balanceRateThresholds,
        })),
      resetExecutionRateThresholds: () =>
        setSettings((current) => ({
          ...current,
          executionRateThresholds: defaultExecutionRateThresholds,
        })),
      resetBalanceRateThresholds: () =>
        setSettings((current) => ({
          ...current,
          balanceRateThresholds: defaultBalanceRateThresholds,
        })),
    }),
    [settings],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
