import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  fetchMock,
  readStoredAppSettings,
  renderSettingsRoute,
  setupSettingsTests,
  storedAppSettings,
} from "./settingsTestUtils";

describe("SettingsPage", () => {
  setupSettingsTests();
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

    renderSettingsRoute();

    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "カラーテーマ" })).toBeInTheDocument();

    const graySkyRadio = screen.getByRole("radio", { name: /グレー＋水色系/ });
    const tealYellowRadio = screen.getByRole("radio", { name: /青緑＋黄色系/ });
    expect(tealYellowRadio).toBeChecked();
    expect(graySkyRadio).not.toBeChecked();

    await user.click(graySkyRadio);

    expect(graySkyRadio).toBeChecked();
    expect(readStoredAppSettings().themePreset).toBe("gray-sky");
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
      storedAppSettings({
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

    renderSettingsRoute();

    const customRadio = await screen.findByRole("radio", { name: /研究室標準/ });
    expect(customRadio).toBeChecked();
    expect(screen.getByRole("radio", { name: /青緑＋黄色系/ })).not.toBeChecked();
  });

  it("creates, selects, edits, and deletes custom chart presets from the folded editor", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderSettingsRoute();

    await screen.findByRole("heading", { name: "外観" });
    await user.click(screen.getByRole("button", { name: "カスタムプリセットを追加" }));
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
    await user.click(screen.getByRole("button", { name: /保存/ }));

    expect(screen.getByRole("radio", { name: /研究室暖色/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /研究室標準/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "カスタムプリセットを削除: 研究室暖色" }));

    expect(screen.queryByRole("radio", { name: /研究室暖色/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /青緑＋黄色系/ })).toBeChecked();
  }, 10_000);

  it("warns about low readability for custom preset colors selected from pickers", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        funds: [],
      }),
    });

    renderSettingsRoute();

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

    expect(screen.getByText("配色が近いため読みづらい可能性があります。")).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "警告付きで保存" });
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

    renderSettingsRoute();

    expect(await screen.findByRole("radiogroup", { name: "カラーテーマ" })).toBeInTheDocument();
    const darkButton = screen.getByRole("button", { name: "ダーク" });
    const systemButton = screen.getByRole("button", { name: "システムのデフォルト" });
    const tealYellowRadio = screen.getByRole("radio", { name: /青緑＋黄色系/ });

    await user.click(darkButton);

    expect(tealYellowRadio).toBeChecked();
    expect(readStoredAppSettings().appThemeMode).toBe("dark");

    await user.click(systemButton);

    expect(readStoredAppSettings().appThemeMode).toBe("system");
  });
});
