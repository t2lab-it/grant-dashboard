import type { RouteObject } from "react-router-dom";
import { AppShell } from "./AppShell";

export const routes: RouteObject[] = [
  {
    path: "*",
    element: <AppShell />,
  },
];
