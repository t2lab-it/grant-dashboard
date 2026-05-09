import { createContext, useContext, useState, type ReactNode } from "react";

type WorkbookExportStatus = {
  workbookPath: string;
  exportedAt: string;
};

type WorkbookExportStatusContextValue = {
  status: WorkbookExportStatus | null;
  setStatus: (status: WorkbookExportStatus | null) => void;
};

const WorkbookExportStatusContext = createContext<WorkbookExportStatusContextValue>({
  status: null,
  setStatus: () => {},
});

export function WorkbookExportStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WorkbookExportStatus | null>(null);

  return (
    <WorkbookExportStatusContext.Provider value={{ status, setStatus }}>
      {children}
    </WorkbookExportStatusContext.Provider>
  );
}

export function useWorkbookExportStatus() {
  return useContext(WorkbookExportStatusContext);
}
