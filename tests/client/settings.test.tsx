import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { routes } from "../../src/app/routes";
import {
  fetchMock,
  renderWithAppRouter,
  resetClientTestState,
  stubMatchMedia,
} from "./testUtils";

stubMatchMedia();

function renderAppRoute(initialEntry: string) {
  return renderWithAppRouter(routes, initialEntry);
}

function storedSettings(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    appThemeMode: "system",
    themePreset: "teal-yellow",
    customChartPresets: [],
    defaultRateMetric: "execution",
    defaultOverviewDisplayMode: "chart",
    notesDisplayMode: "hover",
    defaultFundId: null,
    defaultCategoryId: null,
    amountDisplayMode: "grouped-yen",
    fundDetailSectionOrder: ["categories", "timeline", "actualEntries", "plannedItems"],
    executionRateThresholds: {
      notice: 70,
      warning: 90,
      alert: 100,
    },
    balanceRateThresholds: {
      notice: 30,
      warning: 10,
      alert: 0,
    },
    ...overrides,
  });
}

describe("SettingsPage", () => {
  beforeEach(() => {
    resetClientTestState();
  });

  afterEach(() => {
    cleanup();
  });

  it("manages research project tags and auxiliary labels", async () => {
    const user = userEvent.setup();
    let projectTags = [{ id: 1, kind: "project", name: "CREST 量子", color: "#2563eb" }];
    let auxiliaryLabels = [{ id: 2, kind: "auxiliary", name: "学生支援", color: "#16a34a" }];

    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/overview")) {
        return {
          ok: true,
          json: async () => ({ funds: [] }),
        };
      }

      if (url === "/api/classifications" && method === "GET") {
        return {
          ok: true,
          json: async () => ({ projectTags, auxiliaryLabels }),
        };
      }

      if (url === "/api/classifications" && method === "POST") {
        const payload = JSON.parse(String(init?.body)) as { kind: "project" | "auxiliary"; name: string; color: string };
        if (payload.kind === "project") {
          projectTags = [...projectTags, { id: 3, ...payload }];
        } else {
          auxiliaryLabels = [...auxiliaryLabels, { id: 4, ...payload }];
        }
        return {
          ok: true,
          json: async () => ({ id: payload.kind === "project" ? 3 : 4 }),
        };
      }

      if (url === "/api/classifications/2" && method === "PUT") {
        const payload = JSON.parse(String(init?.body)) as { name: string; color: string };
        auxiliaryLabels = auxiliaryLabels.map((label) => (label.id === 2 ? { ...label, ...payload } : label));
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }

      if (url === "/api/classifications/1" && method === "DELETE") {
        projectTags = projectTags.filter((tag) => tag.id !== 1);
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    renderAppRoute("/settings");

    expect(await screen.findByRole("heading", { name: "研究プロジェクトタグ" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "補助ラベル" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "分類タグ・補助ラベル" })).not.toBeInTheDocument();
    expect(await screen.findByText("CREST 量子")).toBeInTheDocument();
    expect(await screen.findByText("学生支援")).toBeInTheDocument();
    expect(screen.getByText("#2563eb")).toBeInTheDocument();
    expect(screen.getByText("#16a34a")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("CREST 量子")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("学生支援")).not.toBeInTheDocument();
    expect(screen.queryByText("研究プロジェクトタグ名")).not.toBeInTheDocument();
    expect(screen.queryByText("研究プロジェクトタグ色")).not.toBeInTheDocument();
    expect(screen.queryByText("補助ラベル名")).not.toBeInTheDocument();
    expect(screen.queryByText("補助ラベル色")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "研究プロジェクトタグを保存: CREST 量子" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "補助ラベルを保存: 学生支援" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "研究プロジェクトタグを編集: CREST 量子" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "補助ラベルを編集: 学生支援" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "研究プロジェクトタグの使い分け" })).toHaveAccessibleDescription(
      "研究プロジェクトタグは、同じ研究テーマや事業に紐づく複数の予算を束ねる分類です。例: 量子制御基盤、次世代通信、学内共同研究。",
    );
    expect(screen.getByRole("button", { name: "補助ラベルの使い分け" })).toHaveAccessibleDescription(
      "費目は予算額・残高・消化率を管理する会計上の分類です。補助ラベルは、予算や費目をまたいで後から探したい印です。例: 学生支援、出張、要確認。",
    );

    await user.type(screen.getAllByLabelText("研究プロジェクトタグ名")[0], "新規PJ");
    fireEvent.change(screen.getAllByLabelText("研究プロジェクトタグ色")[0], { target: { value: "#7c3aed" } });
    await user.click(screen.getByRole("button", { name: "研究プロジェクトタグを追加" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/classifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "project", name: "新規PJ", color: "#7c3aed" }),
    });

    await user.click(screen.getByRole("button", { name: "補助ラベルを編集: 学生支援" }));
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "補助ラベルを保存: 学生支援" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "補助ラベルの編集をキャンセル: 学生支援" })).not.toBeInTheDocument();
    await user.clear(screen.getByDisplayValue("学生支援"));
    await user.type(screen.getByLabelText("補助ラベル名: 学生支援"), "学生旅費");
    fireEvent.change(screen.getByLabelText("補助ラベル色: 学生旅費"), { target: { value: "#15803d" } });
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/classifications/2", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "学生旅費", color: "#15803d" }),
    });

    await user.click(screen.getByRole("button", { name: "研究プロジェクトタグを削除: CREST 量子" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/classifications/1", { method: "DELETE" });
  }, 10_000);

  it("renders theme cards with donut previews and persists the selected theme", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [
          { id: 2, name: "基盤研究費" },
          { id: 3, name: "ACT-X" },
        ],
      }),
    });

    renderAppRoute("/settings");

    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "カラーテーマ" })).toBeInTheDocument();
    expect(screen.queryByText("この画面の内容は今後詰める予定です。導線だけ先に用意しています。")).not.toBeInTheDocument();

    const graySkyRadio = screen.getByRole("radio", { name: /グレー＋水色系/ });
    const tealYellowRadio = screen.getByRole("radio", { name: /青緑＋黄色系/ });
    expect(tealYellowRadio).toBeChecked();
    expect(graySkyRadio).not.toBeChecked();

    await user.click(graySkyRadio);

    expect(graySkyRadio).toBeChecked();
    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(storedSettings({ themePreset: "gray-sky" }));
  });

  it("loads saved custom chart presets and keeps the selected custom preset checked", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });
    window.localStorage.setItem(
      "budget-dashboard:settings",
      storedSettings({
        themePreset: "custom:lab-standard",
        customChartPresets: [
          {
            id: "lab-standard",
            label: "研究室標準",
            palette: {
              actual: "#7c3aed",
              committed: "#f97316",
              balance: "#fff7ed",
              balanceBorder: "#c2410c",
            },
          },
        ],
      }),
    );

    renderAppRoute("/settings");

    const customRadio = await screen.findByRole("radio", { name: /研究室標準/ });
    expect(customRadio).toBeChecked();
    expect(screen.getByRole("radio", { name: /青緑＋黄色系/ })).not.toBeChecked();
    const customCard = customRadio.closest("label");
    expect(customCard).not.toBeNull();
    expect(within(customCard as HTMLElement).getByLabelText("研究室標準 の予算内訳")).toBeInTheDocument();
  });

  it("creates, selects, edits, and deletes custom chart presets from the folded editor", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderAppRoute("/settings");

    await screen.findByRole("heading", { name: "外観" });
    await user.click(screen.getByRole("button", { name: "カスタムプリセットを追加" }));
    expect(screen.getByLabelText("カスタムプリセット例 の予算内訳")).toBeInTheDocument();
    await user.type(screen.getByLabelText("プリセット名"), "研究室標準");
    fireEvent.change(screen.getByLabelText("執行済カラーピッカー"), {
      target: { value: "#7c3aed" },
    });
    fireEvent.change(screen.getByLabelText("執行予定カラーピッカー"), {
      target: { value: "#f97316" },
    });
    fireEvent.change(screen.getByLabelText("残高カラーピッカー"), {
      target: { value: "#fff7ed" },
    });
    fireEvent.change(screen.getByLabelText("残高枠線カラーピッカー"), {
      target: { value: "#c2410c" },
    });
    await user.click(screen.getByRole("button", { name: /保存/ }));

    const customRadio = screen.getByRole("radio", { name: /研究室標準/ });
    expect(customRadio).toBeChecked();
    const savedAfterCreate = JSON.parse(window.localStorage.getItem("budget-dashboard:settings") ?? "{}") as {
      themePreset?: string;
      customChartPresets?: Array<{
        id: string;
        label: string;
        palette: {
          actual: string;
          committed: string;
          balance: string;
          balanceBorder: string;
        };
      }>;
    };
    expect(savedAfterCreate.themePreset).toMatch(/^custom:/);
    expect(savedAfterCreate.customChartPresets).toEqual([
      {
        id: expect.any(String),
        label: "研究室標準",
        palette: {
          actual: "#7c3aed",
          committed: "#f97316",
          balance: "#fff7ed",
          balanceBorder: "#c2410c",
        },
      },
    ]);

    await user.click(screen.getByRole("button", { name: "カスタムプリセットを編集: 研究室標準" }));
    await user.clear(screen.getByLabelText("プリセット名"));
    await user.type(screen.getByLabelText("プリセット名"), "研究室暖色");
    fireEvent.change(screen.getByLabelText("執行済カラーピッカー"), {
      target: { value: "#db2777" },
    });
    await user.click(screen.getByRole("button", { name: /保存/ }));

    expect(screen.getByRole("radio", { name: /研究室暖色/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /研究室標準/ })).not.toBeInTheDocument();
    const savedAfterEdit = JSON.parse(window.localStorage.getItem("budget-dashboard:settings") ?? "{}") as {
      customChartPresets?: Array<{ id: string; label: string; palette: { actual: string } }>;
    };
    expect(savedAfterEdit.customChartPresets?.[0]).toMatchObject({
      id: savedAfterCreate.customChartPresets?.[0].id,
      label: "研究室暖色",
      palette: { actual: "#db2777" },
    });

    await user.click(screen.getByRole("button", { name: "カスタムプリセットを削除: 研究室暖色" }));

    expect(screen.queryByRole("radio", { name: /研究室暖色/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /青緑＋黄色系/ })).toBeChecked();
    const savedAfterDelete = JSON.parse(window.localStorage.getItem("budget-dashboard:settings") ?? "{}") as {
      themePreset?: string;
      customChartPresets?: unknown[];
    };
    expect(savedAfterDelete.themePreset).toBe("teal-yellow");
    expect(savedAfterDelete.customChartPresets).toEqual([]);
  }, 10_000);

  it("warns about low readability for custom preset colors selected from pickers", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderAppRoute("/settings");

    await screen.findByRole("heading", { name: "外観" });
    await user.click(screen.getByRole("button", { name: "カスタムプリセットを追加" }));
    await user.type(screen.getByLabelText("プリセット名"), "薄い配色");
    fireEvent.change(screen.getByLabelText("執行済カラーピッカー"), {
      target: { value: "#fefefe" },
    });
    fireEvent.change(screen.getByLabelText("執行予定カラーピッカー"), {
      target: { value: "#fdfdfd" },
    });
    fireEvent.change(screen.getByLabelText("残高カラーピッカー"), {
      target: { value: "#ffffff" },
    });
    fireEvent.change(screen.getByLabelText("残高枠線カラーピッカー"), {
      target: { value: "#fefefe" },
    });

    const warning = screen.getByText("配色が近いため読みづらい可能性があります。");
    const saveButton = screen.getByRole("button", { name: "警告付きで保存" });
    expect(Boolean(saveButton.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    await user.click(saveButton);

    expect(screen.getByRole("radio", { name: /薄い配色/ })).toBeChecked();
  });

  it("persists the app theme selection separately from chart presets", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderAppRoute("/settings");

    expect(await screen.findByRole("radiogroup", { name: "カラーテーマ" })).toBeInTheDocument();
    const lightButton = screen.getByRole("button", { name: "ライト" });
    const darkButton = screen.getByRole("button", { name: "ダーク" });
    const systemButton = screen.getByRole("button", { name: "システムのデフォルト" });
    const tealYellowRadio = screen.getByRole("radio", { name: /青緑＋黄色系/ });

    expect(systemButton).toHaveAttribute("aria-pressed", "true");
    expect(lightButton).toHaveAttribute("aria-pressed", "true");
    expect(darkButton).toHaveAttribute("aria-pressed", "false");
    expect(tealYellowRadio).toBeChecked();

    await user.click(darkButton);

    expect(systemButton).toHaveAttribute("aria-pressed", "false");
    expect(darkButton).toHaveAttribute("aria-pressed", "true");
    expect(tealYellowRadio).toBeChecked();
    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(
      storedSettings({ appThemeMode: "dark" }),
    );

    await user.click(systemButton);

    expect(systemButton).toHaveAttribute("aria-pressed", "true");
    expect(lightButton).toHaveAttribute("aria-pressed", "true");
    expect(darkButton).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(
      storedSettings({ appThemeMode: "system" }),
    );
  });

  it("uses toggle buttons for two-choice defaults and persists their selections", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderAppRoute("/settings");

    const overviewDisplayToggle = await screen.findByRole("group", {
      name: "Overview の既定表示",
    });
    const rateMetricToggle = screen.getByRole("group", { name: "率表示の既定値" });
    const numericDisplayButton = within(overviewDisplayToggle).getByRole("button", {
      name: "数値",
    });
    const balanceRateButton = within(rateMetricToggle).getByRole("button", {
      name: "残高率",
    });
    const clickNotesRadio = screen.getByRole("radio", { name: /クリックで表示/ });

    expect(
      within(overviewDisplayToggle).getByRole("button", { name: "円グラフ" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(numericDisplayButton).toHaveAttribute("aria-pressed", "false");
    expect(
      within(rateMetricToggle).getByRole("button", { name: "予算消化率" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(balanceRateButton).toHaveAttribute("aria-pressed", "false");

    await user.click(balanceRateButton);
    await user.click(numericDisplayButton);
    await user.click(clickNotesRadio);

    expect(numericDisplayButton).toHaveAttribute("aria-pressed", "true");
    expect(balanceRateButton).toHaveAttribute("aria-pressed", "true");

    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(
      storedSettings({
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

    renderAppRoute("/settings");

    const plainYenRadio = await screen.findByRole("radio", { name: /円のみ/ });
    const thousandYenRadio = screen.getByRole("radio", { name: /千円 例: 1235千円/ });

    await user.click(plainYenRadio);
    await user.click(thousandYenRadio);

    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(
      storedSettings({ amountDisplayMode: "thousand-yen" }),
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

    renderAppRoute("/settings");

    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();
    const rateFieldset = screen.getByText("率表示の既定値").closest("fieldset");
    expect(rateFieldset).not.toBeNull();
    expect(within(rateFieldset as HTMLElement).getByText("予算消化率のしきい値")).toBeInTheDocument();
    expect(screen.queryByText("「率表示の既定値」で選んでいる方の境界を編集します。")).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "notice" })).toHaveValue(70);
    expect(screen.getByRole("spinbutton", { name: "warning" })).toHaveValue(90);
    expect(screen.getByRole("spinbutton", { name: "alert" })).toHaveValue(100);
    expect(screen.getByText("notice ≥")).toBeInTheDocument();
    expect(screen.getByText("warning ≥")).toBeInTheDocument();
    expect(screen.getByText("alert ≥")).toBeInTheDocument();
    expect(screen.getByText("normal: 69.0%")).toBeInTheDocument();
    expect(screen.getByText("notice: 80.0%")).toHaveClass("detail-rate-notice");
    expect(screen.getByText("warning: 95.0%")).toHaveClass("detail-rate-warning");
    expect(screen.getByText("alert: 100.0%")).toHaveClass("detail-rate-alert");

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
      storedSettings({
        executionRateThresholds: {
          notice: 60,
          warning: 90,
          alert: 120,
        },
      }),
    );
    expect(screen.getByText("normal: 59.0%")).toBeInTheDocument();
    expect(screen.getByText("notice: 75.0%")).toHaveClass("detail-rate-notice");
    expect(screen.getByText("warning: 105.0%")).toHaveClass("detail-rate-warning");
    expect(screen.getByText("alert: 120.0%")).toHaveClass("detail-rate-alert");

    const thresholdFieldset = screen.getByText("予算消化率のしきい値").closest("fieldset");
    expect(thresholdFieldset).not.toBeNull();
    await user.click(within(thresholdFieldset as HTMLElement).getByRole("button", { name: "デフォルト値に戻す" }));

    expect(screen.getByRole("spinbutton", { name: "notice" })).toHaveValue(70);
    expect(screen.getByRole("spinbutton", { name: "warning" })).toHaveValue(90);
    expect(screen.getByRole("spinbutton", { name: "alert" })).toHaveValue(100);
    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(storedSettings());
  });

  it("switches the threshold editor to balance mode using the selected default rate metric", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderAppRoute("/settings");

    await screen.findByRole("heading", { name: "設定" });
    const rateMetricToggle = screen.getByRole("group", { name: "率表示の既定値" });
    await user.click(within(rateMetricToggle).getByRole("button", { name: "残高率" }));

    const rateFieldset = screen.getByText("率表示の既定値").closest("fieldset");
    expect(rateFieldset).not.toBeNull();
    expect(within(rateFieldset as HTMLElement).getByText("残高率のしきい値")).toBeInTheDocument();
    expect(screen.getByText("notice <")).toBeInTheDocument();
    expect(screen.getByText("warning <")).toBeInTheDocument();
    expect(screen.getByText("alert <")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "notice" })).toHaveValue(30);
    expect(screen.getByRole("spinbutton", { name: "warning" })).toHaveValue(10);
    expect(screen.getByRole("spinbutton", { name: "alert" })).toHaveValue(0);
    expect(screen.getByText("normal: 31.0%")).toBeInTheDocument();
    expect(screen.getByText("notice: 20.0%")).toHaveClass("detail-rate-notice");
    expect(screen.getByText("warning: 5.0%")).toHaveClass("detail-rate-warning");
    expect(screen.getByText("alert: -1.0%")).toHaveClass("detail-rate-alert");

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
      storedSettings({
        defaultRateMetric: "balance",
        balanceRateThresholds: {
          notice: 40,
          warning: 10,
          alert: -5,
        },
      }),
    );
    expect(screen.getByText("normal: 41.0%")).toBeInTheDocument();
    expect(screen.getByText("notice: 25.0%")).toHaveClass("detail-rate-notice");
    expect(screen.getByText("warning: 2.5%")).toHaveClass("detail-rate-warning");
    expect(screen.getByText("alert: -6.0%")).toHaveClass("detail-rate-alert");
  });

  it("persists the shared default fund and category, and clears the category when the fund changes", async () => {
    const user = userEvent.setup();

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/overview") {
        return {
          ok: true,
          json: async () => ({
            funds: [
              { id: 2, name: "基盤研究費" },
              { id: 3, name: "ACT-X" },
            ],
          }),
        };
      }

      if (url === "/api/funds/2") {
        return {
          ok: true,
          json: async () => ({
            categories: [
              { id: 5, categoryName: "物品費" },
              { id: 14, categoryName: "旅費" },
            ],
            plannedItems: [],
          }),
        };
      }

      if (url === "/api/funds/3") {
        return {
          ok: true,
          json: async () => ({
            categories: [{ id: 8, categoryName: "会議費" }],
            plannedItems: [],
          }),
        };
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderAppRoute("/settings");

    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();

    const defaultFundSelect = screen.getByLabelText("新規作成時の既定予算");
    const defaultCategorySelect = screen.getByLabelText("新規作成時の既定費目");
    expect(defaultCategorySelect).toBeDisabled();

    expect(await screen.findByRole("option", { name: "基盤研究費" })).toBeInTheDocument();
    await user.selectOptions(defaultFundSelect, "2");
    expect(await screen.findByRole("option", { name: "旅費" })).toBeInTheDocument();

    await user.selectOptions(defaultCategorySelect, "14");

    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(
      storedSettings({
        defaultFundId: 2,
        defaultCategoryId: 14,
      }),
    );

    await user.selectOptions(defaultFundSelect, "3");

    expect(screen.getByLabelText("新規作成時の既定費目")).toHaveValue("");
    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(
      storedSettings({
        defaultFundId: 3,
        defaultCategoryId: null,
      }),
    );
  });

  it("moves fund detail sections with arrow controls and persists the configured order", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderAppRoute("/settings");

    const sectionList = await screen.findByRole("list", { name: "予算ページの表示順" });
    const sectionFieldset = sectionList.closest("fieldset");
    expect(sectionFieldset).not.toBeNull();
    const getSectionLabels = () =>
      Array.from(within(sectionList).getAllByRole("listitem")).map(
        (item) => item.querySelector("span")?.textContent,
      );

    expect(
      screen.queryByText("予算ページで表示する 4 セクションの並びを、上へ / 下へで入れ替えます。"),
    ).not.toBeInTheDocument();
    expect(getSectionLabels()).toEqual([
      "費目別の状況",
      "月別の状況",
      "精算項目一覧",
      "計画項目一覧",
    ]);
    expect(screen.getByRole("button", { name: "精算項目一覧を上へ" })).toHaveTextContent("↑");
    expect(screen.getByRole("button", { name: "費目別の状況を下へ" })).toHaveTextContent("↓");

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
    expect(window.localStorage.getItem("budget-dashboard:settings")).toBe(storedSettings());
  });
});
