import { fireEvent, screen } from "@testing-library/react";
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

    renderSettingsRoute();

    expect(await screen.findByRole("heading", { name: "研究プロジェクトタグ" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "補助ラベル" })).toBeInTheDocument();
    expect(await screen.findByText("CREST 量子")).toBeInTheDocument();
    expect(await screen.findByText("学生支援")).toBeInTheDocument();
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
});
