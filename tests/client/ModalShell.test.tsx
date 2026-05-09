import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalShell } from "../../src/app/ModalShell";

describe("ModalShell", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders inline without a portal and uses aria-label when requested", () => {
    const { container } = render(
      <div data-testid="host">
        <ModalShell ariaLabel="予定作成" onRequestClose={() => {}} usePortal={false}>
          <div>inline modal body</div>
        </ModalShell>
      </div>,
    );

    const dialog = screen.getByRole("dialog", { name: "予定作成" });
    expect(dialog).toHaveTextContent("inline modal body");
    expect(container.querySelector("[data-testid='host']")?.contains(dialog)).toBe(true);
  });

  it("renders in document.body and supports aria-labelledby when portal is enabled", () => {
    render(
      <div data-testid="host">
        <ModalShell ariaLabelledBy="modal-title" onRequestClose={() => {}} usePortal>
          <h3 id="modal-title">workbook をエクスポート</h3>
        </ModalShell>
      </div>,
    );

    const dialog = screen.getByRole("dialog", { name: "workbook をエクスポート" });
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.closest("[data-testid='host']")).toBeNull();
  });

  it("calls onRequestClose only for allowed backdrop clicks", () => {
    const onRequestClose = vi.fn();
    const { rerender } = render(
      <ModalShell ariaLabel="予算を編集" canCloseOnBackdrop={false} onRequestClose={onRequestClose}>
        <button type="button">inner button</button>
      </ModalShell>,
    );

    const dialog = screen.getByRole("dialog", { name: "予算を編集" });
    fireEvent.click(dialog.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "inner button" }));
    expect(onRequestClose).not.toHaveBeenCalled();

    rerender(
      <ModalShell ariaLabel="予算を編集" canCloseOnBackdrop onRequestClose={onRequestClose}>
        <button type="button">inner button</button>
      </ModalShell>,
    );

    fireEvent.click(screen.getByRole("dialog", { name: "予算を編集" }).parentElement as HTMLElement);
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });
});
