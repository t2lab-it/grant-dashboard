import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import {
  fetchMock,
  renderAppRoute,
  resetOverviewTestState,
  setHoverCapablePointer,
} from "./overviewTestUtils";

export { fetchMock, renderAppRoute, resetOverviewTestState, setHoverCapablePointer };

export function setupFundDetailTests() {
  beforeEach(() => {
    resetOverviewTestState();
  });

  afterEach(() => {
    cleanup();
  });
}

export function renderFundDetailRoute(path: `/funds/${string}`) {
  return renderAppRoute(path);
}
