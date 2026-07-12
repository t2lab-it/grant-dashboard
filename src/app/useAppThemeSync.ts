import { useEffect } from "react";
import type { AppThemeMode } from "../features/settings/AppSettings";

function getSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light" as const;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveAppTheme(mode: AppThemeMode) {
  return mode === "system" ? getSystemTheme() : mode;
}

export function useAppThemeSync(appThemeMode: AppThemeMode) {
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = resolveAppTheme(appThemeMode);
    }

    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function" ||
      appThemeMode !== "system"
    ) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleThemeChange() {
      document.documentElement.dataset.theme = resolveAppTheme(appThemeMode);
    }

    mediaQuery.addEventListener("change", handleThemeChange);
    return () => {
      mediaQuery.removeEventListener("change", handleThemeChange);
    };
  }, [appThemeMode]);
}
