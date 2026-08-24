import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { routes } from "../../src/app/routes";
import { APP_SETTINGS_STORAGE_KEY } from "../../src/features/settings/AppSettings";
import {
  fetchMock,
  renderWithAppRouter,
  resetClientTestState,
  storedAppSettings,
  stubMatchMedia,
} from "./testUtils";

stubMatchMedia();

export { fetchMock, storedAppSettings };

export function renderSettingsRoute() {
  return renderWithAppRouter(routes, "/settings");
}

export function readStoredAppSettings() {
  const storedSettings = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (storedSettings === null) {
    throw new Error("Expected app settings to be stored");
  }

  return JSON.parse(storedSettings) as Record<string, unknown>;
}

export function setupSettingsTests() {
  beforeEach(() => {
    resetClientTestState();
  });

  afterEach(() => {
    cleanup();
  });
}
