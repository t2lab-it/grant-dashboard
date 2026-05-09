import type { ReactNode } from "react";

type PageStatusMessageKind = "loading" | "error" | "empty";

type PageStatusMessageProps = {
  children: ReactNode;
  kind: PageStatusMessageKind;
};

const kindClassNames: Record<PageStatusMessageKind, string> = {
  loading: "app-route-loading",
  error: "app-route-error",
  empty: "app-route-empty",
};

export function PageStatusMessage({ children, kind }: PageStatusMessageProps) {
  const className = `app-page-status ${kindClassNames[kind]}`;

  if (kind === "error") {
    return (
      <div className={className} role="alert">
        {children}
      </div>
    );
  }

  return (
    <div className={className} role="status" aria-live="polite">
      {children}
    </div>
  );
}
