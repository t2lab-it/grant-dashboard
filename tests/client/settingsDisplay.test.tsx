import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  fetchMock,
  readStoredAppSettings,
  renderSettingsRoute,
  setupSettingsTests,
} from "./settingsTestUtils";

describe("SettingsPage", () => {
  setupSettingsTests();
  it("uses toggle buttons for two-choice defaults and persists their selections", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderSettingsRoute();

    const overviewDisplayToggle = await screen.findByRole("group", {
      name: "概要画面の既定表示",
    });
    const rateMetricToggle = screen.getByRole("group", { name: "率表示の既定値" });
    const numericDisplayButton = within(overviewDisplayToggle).getByRole("button", {
      name: "数値",
    });
    const balanceRateButton = within(rateMetricToggle).getByRole("button", {
      name: "残高率",
    });
    const clickNotesRadio = screen.getByRole("radio", { name: /クリックで表示/ });

    await user.click(balanceRateButton);
    await user.click(numericDisplayButton);
    await user.click(clickNotesRadio);

    expect(numericDisplayButton).toHaveAttribute("aria-pressed", "true");
    expect(balanceRateButton).toHaveAttribute("aria-pressed", "true");

    expect(readStoredAppSettings()).toMatchObject({
      defaultRateMetric: "balance",
      defaultOverviewDisplayMode: "numeric",
      notesDisplayMode: "click",
    });
  });

  it("persists the selected amount display mode", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderSettingsRoute();

    const plainYenRadio = await screen.findByRole("radio", { name: "1234567円" });
    const thousandYenRadio = screen.getByRole("radio", { name: "1235千円" });

    await user.click(plainYenRadio);
    await user.click(thousandYenRadio);

    expect(readStoredAppSettings()).toMatchObject({ amountDisplayMode: "thousand-yen" });
  });

  it("shows threshold examples for the selected rate metric, persists edits, and resets to defaults", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderSettingsRoute();

    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();
    const rateFieldset = screen.getByText("率表示の既定値").closest("fieldset");
    expect(rateFieldset).not.toBeNull();
    expect(within(rateFieldset as HTMLElement).getByText("予算消化率のしきい値")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "注意のしきい値（%）" })).toHaveValue(70);
    expect(screen.getByRole("spinbutton", { name: "警告のしきい値（%）" })).toHaveValue(90);
    expect(screen.getByRole("spinbutton", { name: "要対応のしきい値（%）" })).toHaveValue(100);
    expect(screen.getByText("要対応: 100.0%")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "注意のしきい値（%）" }), {
      target: { value: "60", valueAsNumber: 60 },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "警告のしきい値（%）" }), {
      target: { value: "90", valueAsNumber: 90 },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "要対応のしきい値（%）" }), {
      target: { value: "120", valueAsNumber: 120 },
    });

    expect(readStoredAppSettings().executionRateThresholds).toEqual({
      notice: 60,
      warning: 90,
      alert: 120,
    });
    expect(screen.getByText("要対応: 120.0%")).toBeInTheDocument();

    const thresholdFieldset = screen.getByText("予算消化率のしきい値").closest("fieldset");
    expect(thresholdFieldset).not.toBeNull();
    await user.click(within(thresholdFieldset as HTMLElement).getByRole("button", { name: "デフォルト値に戻す" }));

    expect(screen.getByRole("spinbutton", { name: "注意のしきい値（%）" })).toHaveValue(70);
    expect(readStoredAppSettings().executionRateThresholds).toEqual({
      notice: 70,
      warning: 90,
      alert: 100,
    });
  });

  it("switches the threshold editor to balance mode using the selected default rate metric", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderSettingsRoute();

    await screen.findByRole("heading", { name: "設定" });
    const rateMetricToggle = screen.getByRole("group", { name: "率表示の既定値" });
    await user.click(within(rateMetricToggle).getByRole("button", { name: "残高率" }));

    const rateFieldset = screen.getByText("率表示の既定値").closest("fieldset");
    expect(rateFieldset).not.toBeNull();
    expect(within(rateFieldset as HTMLElement).getByText("残高率のしきい値")).toBeInTheDocument();
    expect(screen.getByText("注意 <")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "注意のしきい値（%）" })).toHaveValue(30);
    expect(screen.getByText("注意: 20.0%")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "注意のしきい値（%）" }), {
      target: { value: "40", valueAsNumber: 40 },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "警告のしきい値（%）" }), {
      target: { value: "10", valueAsNumber: 10 },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "要対応のしきい値（%）" }), {
      target: { value: "-5", valueAsNumber: -5 },
    });

    expect(readStoredAppSettings()).toMatchObject({
      defaultRateMetric: "balance",
      balanceRateThresholds: {
        notice: 40,
        warning: 10,
        alert: -5,
      },
    });
    expect(screen.getByText("注意: 25.0%")).toBeInTheDocument();
  });

  it("moves fund detail sections with arrow controls and persists the configured order", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderSettingsRoute();

    const sectionList = await screen.findByRole("list", { name: "予算ページの表示順" });
    const sectionFieldset = sectionList.closest("fieldset");
    expect(sectionFieldset).not.toBeNull();
    const sectionLabels = [
      "費目別の状況",
      "月別の状況",
      "実績",
      "予定",
    ] as const;
    const getSectionLabels = () =>
      within(sectionList).getAllByRole("listitem").map(
        (item) => sectionLabels.find((label) => within(item).queryByText(label) !== null),
      );

    expect(getSectionLabels()).toEqual([
      "費目別の状況",
      "月別の状況",
      "実績",
      "予定",
    ]);
    await user.click(screen.getByRole("button", { name: "実績を上へ" }));
    await user.click(screen.getByRole("button", { name: "実績を上へ" }));
    await user.click(screen.getByRole("button", { name: "費目別の状況を下へ" }));

    expect(getSectionLabels()).toEqual([
      "実績",
      "月別の状況",
      "費目別の状況",
      "予定",
    ]);

    await user.click(within(sectionFieldset as HTMLElement).getByRole("button", { name: "デフォルト値に戻す" }));

    expect(getSectionLabels()).toEqual([
      "費目別の状況",
      "月別の状況",
      "実績",
      "予定",
    ]);
    expect(readStoredAppSettings().fundDetailSectionOrder).toEqual([
      "categories",
      "timeline",
      "actualEntries",
      "plannedItems",
    ]);
  });
});

describe("settings save failure", () => {
  setupSettingsTests();
  it("keeps the selected display setting after a storage failure and retries it", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ projectTags: [], auxiliaryLabels: [], funds: [], availableFiscalYears: [], selectedFiscalYear: null }) });
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
  try {
    renderSettingsRoute();
    const option = await screen.findByRole("radio", {name: "1234567円"});
    await user.click(option);
    expect(option).toBeChecked();
    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent("QuotaExceededError");
    storage.mockRestore();
    await user.click(within(message).getByRole("button", {name: "再試行"}));
    expect(readStoredAppSettings().amountDisplayMode).toBe("plain-yen");
  } finally { storage.mockRestore(); }
});

});
