import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { routes } from "../../src/app/routes";
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

export function setupSettingsTests() {
  beforeEach(() => {
    resetClientTestState();
  });

  afterEach(() => {
    cleanup();
  });
}
