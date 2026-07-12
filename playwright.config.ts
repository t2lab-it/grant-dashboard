import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: "http://127.0.0.1:5173",
  },
  webServer: {
    command: "tsx scripts/e2e-dev.ts",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  },
});
