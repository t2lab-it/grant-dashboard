import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const serverPort = Number(process.env.BUDGET_E2E_SERVER_PORT ?? 3101);
const clientPort = Number(process.env.BUDGET_E2E_CLIENT_PORT ?? 6173);
const baseUrl = `http://127.0.0.1:${clientPort}`;
const screenshotDir = resolve("docs/assets/screenshots");
const viewport = { width: 1440, height: 1000 };

function startDemoServer() {
  return spawn("tsx", ["scripts/e2e-dev.ts"], {
    env: {
      ...process.env,
      BUDGET_E2E_SERVER_PORT: String(serverPort),
      BUDGET_E2E_CLIENT_PORT: String(clientPort),
    },
    shell: true,
    stdio: "inherit",
  });
}

async function waitForHttp(url: string, label: string) {
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the child process is ready or times out.
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function dismissTutorialPrompt(page: Page) {
  const prompt = page.getByRole("dialog", { name: "チュートリアルを始めますか？" });
  await prompt.waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
  if (await prompt.isVisible().catch(() => false)) {
    await prompt.getByRole("button", { name: "no" }).click();
    await prompt.waitFor({ state: "hidden" });
  }
}

async function captureScreenshots(page: Page) {
  await page.goto(baseUrl);
  await dismissTutorialPrompt(page);
  await page.screenshot({
    path: resolve(screenshotDir, "overview.png"),
    animations: "disabled",
  });

  const fundResponse = page.waitForResponse("**/api/funds/1");
  await page.getByRole("link", { name: /デモ研究費A/ }).click();
  await fundResponse;
  await page.getByRole("table", { name: "Fund categories" }).waitFor();
  await page.screenshot({
    path: resolve(screenshotDir, "fund-detail.png"),
    animations: "disabled",
  });

  await page.getByRole("link", { name: "研究予算ダッシュボード" }).click();
  await page.getByRole("button", { name: "エクスポート" }).click();
  await page.getByRole("dialog", { name: "workbook をエクスポート" }).waitFor();
  await page.screenshot({
    path: resolve(screenshotDir, "workbook-export-preview.png"),
    animations: "disabled",
  });
}

async function closeServer(server: ChildProcess) {
  if (server.exitCode !== null || server.signalCode !== null) {
    return;
  }

  server.kill("SIGTERM");
  await new Promise<void>((resolveClose) => {
    const timeout = setTimeout(resolveClose, 5_000);
    server.once("exit", () => {
      clearTimeout(timeout);
      resolveClose();
    });
  });
}

async function main() {
  rmSync(screenshotDir, { recursive: true, force: true });
  mkdirSync(screenshotDir, { recursive: true });

  const server = startDemoServer();
  let browser: Browser | null = null;

  try {
    await waitForHttp(baseUrl, "demo frontend");
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport });
    await captureScreenshots(page);
    console.log(`Demo screenshots written to ${screenshotDir}`);
  } finally {
    await browser?.close();
    await closeServer(server);
  }
}

await main();
