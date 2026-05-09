import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { vi } from "vitest";

export const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

type ControlledMatchMediaResult = ReturnType<typeof createControlledMatchMediaResult>;

const matchMediaState = new Map<string, ControlledMatchMediaResult>();

function createControlledMatchMediaResult(query: string, matches = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  return {
    get matches() {
      return matches;
    },
    media: query,
    onchange: null as ((event: MediaQueryListEvent) => void) | null,
    addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
    dispatchEvent: vi.fn(),
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches: nextMatches, media: query } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
      this.onchange?.(event);
    },
  };
}

export function stubMatchMedia() {
  matchMediaState.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => {
      const existing = matchMediaState.get(query);
      if (existing) {
        return existing;
      }

      const created = createControlledMatchMediaResult(query);
      matchMediaState.set(query, created);
      return created;
    }),
  );
}

export function setMatchMediaMatches(query: string, matches: boolean) {
  const mediaQuery = matchMediaState.get(query) ?? createControlledMatchMediaResult(query);
  matchMediaState.set(query, mediaQuery);
  mediaQuery.setMatches(matches);
}

export function resetClientTestState() {
  fetchMock.mockReset();
  window.localStorage.clear();
  matchMediaState.clear();
}

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

export function renderWithMemoryRouter(
  ui: ReactNode,
  { initialEntries = ["/"] }: { initialEntries?: string[] } = {},
): RenderResult {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

export function renderWithAppRouter(
  routes: RouteObject[],
  initialEntry: string,
): RenderResult & {
  queryClient: QueryClient;
  router: ReturnType<typeof createMemoryRouter>;
} {
  const queryClient = createTestQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });
  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return {
    ...renderResult,
    queryClient,
    router,
  };
}
