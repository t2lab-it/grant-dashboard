import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageStatusMessage } from "../../src/app/PageStatusMessage";

describe("PageStatusMessage", () => {
  it("announces loading status politely", () => {
    render(<PageStatusMessage kind="loading">読み込み中...</PageStatusMessage>);

    const status = screen.getByRole("status", { name: "" });
    expect(status).toHaveTextContent("読み込み中...");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("announces page errors assertively", () => {
    render(<PageStatusMessage kind="error">概要を読み込めませんでした。</PageStatusMessage>);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("概要を読み込めませんでした。");
  });
});
