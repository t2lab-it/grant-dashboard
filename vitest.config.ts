import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    maxWorkers: 4,
    exclude: [...configDefaults.exclude, "tests/e2e/**", ".worktrees/**"],
  },
});
