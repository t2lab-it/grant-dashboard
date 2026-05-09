import type { ReactNode } from "react";
import { BudgetModalPortal } from "./BudgetModalPortal";

type ModalShellProps = {
  children: ReactNode;
  onRequestClose: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  canCloseOnBackdrop?: boolean;
  className?: string;
  usePortal?: boolean;
};

export function ModalShell({
  children,
  onRequestClose,
  ariaLabel,
  ariaLabelledBy,
  canCloseOnBackdrop = true,
  className,
  usePortal = false,
}: ModalShellProps) {
  const content = (
    <div
      className="budget-modal-backdrop"
      role="presentation"
      onClick={(event) => canCloseOnBackdrop && event.target === event.currentTarget && onRequestClose()}
    >
      <section
        className={className ? `budget-modal ${className}` : "budget-modal"}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );

  return usePortal ? <BudgetModalPortal>{content}</BudgetModalPortal> : content;
}
