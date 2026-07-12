import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  fetchMock,
  renderSettingsRoute,
  setupSettingsTests,
  storedAppSettings,
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

    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(
      storedAppSettings({
        defaultRateMetric: "balance",
        defaultOverviewDisplayMode: "numeric",
        notesDisplayMode: "click",
      }),
    );
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

    const plainYenRadio = await screen.findByRole("radio", { name: /円のみ/ });
    const thousandYenRadio = screen.getByRole("radio", { name: /千円 例: 1235千円/ });

    await user.click(plainYenRadio);
    await user.click(thousandYenRadio);

    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(
      storedAppSettings({ amountDisplayMode: "thousand-yen" }),
    );
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
    expect(screen.getByRole("spinbutton", { name: "notice" })).toHaveValue(70);
    expect(screen.getByRole("spinbutton", { name: "warning" })).toHaveValue(90);
    expect(screen.getByRole("spinbutton", { name: "alert" })).toHaveValue(100);
    expect(screen.getByText("alert: 100.0%")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "notice" }), {
      target: { value: "60", valueAsNumber: 60 },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "warning" }), {
      target: { value: "90", valueAsNumber: 90 },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "alert" }), {
      target: { value: "120", valueAsNumber: 120 },
    });

    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(
      storedAppSettings({
        executionRateThresholds: {
          notice: 60,
          warning: 90,
          alert: 120,
        },
      }),
    );
    expect(screen.getByText("alert: 120.0%")).toBeInTheDocument();

    const thresholdFieldset = screen.getByText("予算消化率のしきい値").closest("fieldset");
    expect(thresholdFieldset).not.toBeNull();
    await user.click(within(thresholdFieldset as HTMLElement).getByRole("button", { name: "デフォルト値に戻す" }));

    expect(screen.getByRole("spinbutton", { name: "notice" })).toHaveValue(70);
    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(storedAppSettings());
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
    expect(screen.getByText("notice <")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "notice" })).toHaveValue(30);
    expect(screen.getByText("notice: 20.0%")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "notice" }), {
      target: { value: "40", valueAsNumber: 40 },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "warning" }), {
      target: { value: "10", valueAsNumber: 10 },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "alert" }), {
      target: { value: "-5", valueAsNumber: -5 },
    });

    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(
      storedAppSettings({
        defaultRateMetric: "balance",
        balanceRateThresholds: {
          notice: 40,
          warning: 10,
          alert: -5,
        },
      }),
    );
    expect(screen.getByText("notice: 25.0%")).toBeInTheDocument();
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
    const getSectionLabels = () =>
      Array.from(within(sectionList).getAllByRole("listitem")).map(
        (item) => item.querySelector("span")?.textContent,
      );

    expect(getSectionLabels()).toEqual([
      "費目別の状況",
      "月別の状況",
      "精算項目一覧",
      "計画項目一覧",
    ]);
    await user.click(screen.getByRole("button", { name: "精算項目一覧を上へ" }));
    await user.click(screen.getByRole("button", { name: "精算項目一覧を上へ" }));
    await user.click(screen.getByRole("button", { name: "費目別の状況を下へ" }));

    expect(getSectionLabels()).toEqual([
      "精算項目一覧",
      "月別の状況",
      "費目別の状況",
      "計画項目一覧",
    ]);

    await user.click(within(sectionFieldset as HTMLElement).getByRole("button", { name: "デフォルト値に戻す" }));

    expect(getSectionLabels()).toEqual([
      "費目別の状況",
      "月別の状況",
      "精算項目一覧",
      "計画項目一覧",
    ]);
    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(storedAppSettings());
  });
});
