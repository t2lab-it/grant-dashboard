import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { BudgetModalPortal } from "./BudgetModalPortal";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

const mountedModalStack: symbol[] = [];
let originalBodyOverflow = "";

type ModalShellProps = {
  children: ReactNode;
  onRequestClose: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  canClose?: boolean;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  usePortal?: boolean;
};

export function ModalShell({
  children,
  onRequestClose,
  ariaLabel,
  ariaLabelledBy,
  canClose = true,
  className,
  initialFocusRef,
  usePortal = false,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const instanceToken = useRef(Symbol("modal-shell")).current;
  const mountedInitialFocusRef = useRef(initialFocusRef);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (mountedInitialFocusRef.current?.current ?? firstFocusable ?? dialog)?.focus();

    if (mountedModalStack.length === 0) {
      originalBodyOverflow = document.body.style.overflow;
    }
    mountedModalStack.push(instanceToken);
    document.body.style.overflow = "hidden";

    return () => {
      const instanceIndex = mountedModalStack.lastIndexOf(instanceToken);
      if (instanceIndex !== -1) {
        mountedModalStack.splice(instanceIndex, 1);
      }
      if (mountedModalStack.length === 0) {
        document.body.style.overflow = originalBodyOverflow;
      }
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [instanceToken]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (mountedModalStack.at(-1) !== instanceToken) {
        return;
      }

      if (event.key === "Escape") {
        if (canClose) {
          event.preventDefault();
          onRequestClose();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.closest("[hidden], [aria-hidden='true']"),
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements.at(-1)!;
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canClose, instanceToken, onRequestClose]);

  const content = (
    <div
      className="budget-modal-backdrop"
      role="presentation"
      onClick={(event) => canClose && event.target === event.currentTarget && onRequestClose()}
    >
      <section
        ref={dialogRef}
        className={className ? `budget-modal ${className}` : "budget-modal"}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );

  return usePortal ? <BudgetModalPortal>{content}</BudgetModalPortal> : content;
}
