import { createRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalShell } from "../../src/app/ModalShell";

describe("ModalShell", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("exposes an accessible dialog name", () => {
    render(
      <ModalShell ariaLabelledBy="modal-title" onRequestClose={() => {}}>
        <h2 id="modal-title">workbook をエクスポート</h2>
      </ModalShell>,
    );

    expect(screen.getByRole("dialog", { name: "workbook をエクスポート" })).toBeInTheDocument();
  });

  it("requests close on Escape and an outside backdrop click", () => {
    const onRequestClose = vi.fn();
    render(
      <ModalShell ariaLabel="予算を編集" onRequestClose={onRequestClose}>
        <button type="button">保存</button>
      </ModalShell>,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("presentation"));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onRequestClose).toHaveBeenCalledTimes(2);
  });

  it("disables Escape and backdrop close when canClose is false", () => {
    const onRequestClose = vi.fn();
    render(
      <ModalShell ariaLabel="予算を編集中" canClose={false} onRequestClose={onRequestClose}>
        <button type="button">保存中...</button>
      </ModalShell>,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("presentation"));

    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("cycles focus within the dialog with Tab and Shift+Tab", () => {
    render(
      <ModalShell ariaLabel="予算を編集" onRequestClose={() => {}}>
        <button type="button">最初</button>
        <input aria-label="金額" />
        <button type="button">最後</button>
      </ModalShell>,
    );

    const first = screen.getByRole("button", { name: "最初" });
    const last = screen.getByRole("button", { name: "最後" });
    expect(first).toHaveFocus();

    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("lets only the topmost dialog close on Escape", () => {
    const closeBottom = vi.fn();
    const closeTop = vi.fn();
    render(
      <>
        <ModalShell ariaLabel="下のダイアログ" onRequestClose={closeBottom}>
          <button type="button">下の操作</button>
        </ModalShell>
        <ModalShell ariaLabel="上のダイアログ" onRequestClose={closeTop}>
          <button type="button">上の操作</button>
        </ModalShell>
      </>,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();
  });

  it("does not close an underlying dialog when the topmost dialog cannot close", () => {
    const closeBottom = vi.fn();
    const closeTop = vi.fn();
    render(
      <>
        <ModalShell ariaLabel="下のダイアログ" onRequestClose={closeBottom}>
          <button type="button">下の操作</button>
        </ModalShell>
        <ModalShell ariaLabel="上のダイアログ" canClose={false} onRequestClose={closeTop}>
          <button type="button">上の操作</button>
        </ModalShell>
      </>,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(closeTop).not.toHaveBeenCalled();
    expect(closeBottom).not.toHaveBeenCalled();
  });

  it("traps Tab in only the topmost dialog", () => {
    render(
      <>
        <ModalShell ariaLabel="下のダイアログ" onRequestClose={() => {}}>
          <button type="button">下の最初</button>
          <button type="button">下の最後</button>
        </ModalShell>
        <ModalShell ariaLabel="上のダイアログ" onRequestClose={() => {}}>
          <button type="button">上の最初</button>
          <button type="button">上の最後</button>
        </ModalShell>
      </>,
    );

    const bottomFirst = screen.getByRole("button", { name: "下の最初" });
    const bottomFocus = vi.spyOn(bottomFirst, "focus");
    screen.getByRole("button", { name: "上の最後" }).focus();
    fireEvent.keyDown(window, { key: "Tab" });

    expect(screen.getByRole("button", { name: "上の最初" })).toHaveFocus();
    expect(bottomFocus).not.toHaveBeenCalled();
  });

  it("focuses initialFocusRef when provided", () => {
    const initialFocusRef = createRef<HTMLInputElement>();
    render(
      <ModalShell
        ariaLabel="予算を編集"
        initialFocusRef={initialFocusRef}
        onRequestClose={() => {}}
      >
        <button type="button">キャンセル</button>
        <input ref={initialFocusRef} aria-label="金額" />
      </ModalShell>,
    );

    expect(screen.getByRole("textbox", { name: "金額" })).toHaveFocus();
  });

  it("restores focus to the previously focused element when unmounted", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { unmount } = render(
      <ModalShell ariaLabel="予算を編集" onRequestClose={() => {}}>
        <button type="button">閉じる</button>
      </ModalShell>,
    );
    expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();

    unmount();

    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("locks body scrolling while mounted and restores the prior value", () => {
    document.body.style.overflow = "scroll";

    const { unmount } = render(
      <ModalShell ariaLabel="予算を編集" onRequestClose={() => {}}>
        <button type="button">閉じる</button>
      </ModalShell>,
    );

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("keeps body scrolling locked until the final dialog unmounts", () => {
    document.body.style.overflow = "scroll";

    function StackedDialogs() {
      const [showTop, setShowTop] = useState(true);
      const [showBottom, setShowBottom] = useState(true);
      return (
        <>
          {showBottom ? (
            <ModalShell ariaLabel="下のダイアログ" onRequestClose={() => setShowBottom(false)}>
              <button type="button" onClick={() => setShowBottom(false)}>下を閉じる</button>
            </ModalShell>
          ) : null}
          {showTop ? (
            <ModalShell ariaLabel="上のダイアログ" onRequestClose={() => setShowTop(false)}>
              <button type="button" onClick={() => setShowTop(false)}>上を閉じる</button>
            </ModalShell>
          ) : null}
        </>
      );
    }

    render(<StackedDialogs />);
    fireEvent.click(screen.getByRole("button", { name: "上を閉じる" }));
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "下を閉じる" }));
    expect(document.body.style.overflow).toBe("scroll");
  });
});
