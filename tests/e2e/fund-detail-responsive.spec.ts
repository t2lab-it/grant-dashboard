import { expect, test } from "@playwright/test";
import type { FundDetailResponse } from "../../src/features/funds/fundDetailTypes";

const base = { categoryId: 1, categoryCode: "goods", categoryName: "物品費", amount: 100000, notes: "", auxiliaryLabels: [] };
const plannedItems = [1, 2, 3].map((id) => ({ ...base, id: 100 + id, plannedDate: "2026-04-01", scheduledMonth: `2026-0${id + 4}`, description: `予定${id}` }));
const plannedItemHistory = [1, 2, 3].map((id) => ({ ...base, id: 200 + id, plannedDate: "2026-04-01", scheduledMonth: `2026-0${id + 4}`, description: `履歴${id}`, status: id === 1 ? "completed" as const : "cancelled" as const, remainingAmount: 0 }));
const actualEntries = [1, 2, 3].map((id) => ({ ...base, id: 300 + id, actualDate: `2026-0${id + 4}-01`, description: `実績${id}`, status: "completed" as const, remainingAmount: 0 }));

async function setup(page: import("@playwright/test").Page, stress = false, withNote = false) {
  const response = await page.request.get("/api/funds/1");
  expect(response.ok()).toBeTruthy();
  const data: FundDetailResponse = await response.json();
  const fixture = { ...data, plannedItems: plannedItems.map((item, index) => stress && index === 0 ? {
    ...item, description: "長い内容".repeat(30), categoryName: "長い費目".repeat(20), amount: 999999999999999,
    auxiliaryLabels: [{ id: 1, kind: "auxiliary" as const, name: "長い補助ラベル".repeat(10), color: "#123456" }, { id: 2, kind: "auxiliary" as const, name: "補助ラベル2", color: "#123456" }],
  } : withNote && index === 0 ? { ...item, notes: "幅変更後も残るメモ" } : item),
    plannedItemHistory: plannedItemHistory.map((item) => stress && item.status === "completed" ? { ...item, remainingAmount: 999999999999999 } : item), actualEntries };
  expect(fixture.plannedItems.map((item) => item.id)).toEqual([101, 102, 103]);
  expect(fixture.plannedItemHistory.map((item) => item.status)).toEqual(["completed", "cancelled", "cancelled"]);
  expect(fixture.actualEntries.every((item) => item.amount === 100000)).toBeTruthy();
  await page.route("**/api/funds/1", (route) => route.fulfill({ json: fixture }));
  await page.goto("/funds/1?year=2026");
  await expect(page.locator(".detail-history-row")).toHaveCount(9);
}

test("portrait lists fit and reduce row heights", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1600 });
  await setup(page);
  const heights = await page.locator(".detail-history-row").evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  console.log("row heights:", heights, "sum:", heights.reduce((a, b) => a + b, 0));
  // Nine short rows measured 1627.3125px before the layout change (Chromium, 1024x1600).
  expect(heights.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1139.11875);
});

test("layouts align, wrap, and do not depend on viewport height", async ({ page }) => {
  await setup(page);
  for (const width of [390, 768, 899, 900, 901, 1024, 1152, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const rows = page.locator(".detail-history-row");
    const first = rows.first();
    const measure = () => first.evaluate((row) => {
      const rect = (selector: string) => {
        const r = row.querySelector(selector)!.getBoundingClientRect();
        return { x: r.x, y: r.y, height: r.height };
      };
      return { row: row.getBoundingClientRect().height, date: rect(".detail-history-date"), description: rect(".detail-history-description"), amount: rect(".detail-history-amount") };
    });
    const short = await measure();
    await page.setViewportSize({ width, height: 2048 });
    expect(await measure()).toEqual(short);
    if (width <= 900) {
      expect(short.description.y).toBeLessThan(short.date.y);
      const positions = await first.locator(":scope > *").evaluateAll((cells) => [...new Set(cells.map((cell) => getComputedStyle(cell).gridRowStart))]);
      expect(positions.length).toBeLessThanOrEqual(3);
      for (const row of await rows.all()) {
        const buttonTops = await row.locator(".detail-history-actions button").evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
        expect(new Set(buttonTops).size).toBeLessThanOrEqual(1);
      }
    } else {
      expect(Math.abs(short.description.y - short.date.y)).toBeLessThan(5);
      for (const table of await page.locator(".detail-history-table").all()) {
        const alignment = await table.evaluate((element) => {
          const head = element.querySelector(".detail-history-head")!;
          const row = element.querySelector(".detail-history-row")!;
          return [0, 1, 2].map((i) => Math.abs(head.children[i].getBoundingClientRect().x - row.children[i].getBoundingClientRect().x));
        });
        expect(Math.max(...alignment)).toBeLessThanOrEqual(1);
      }
    }
    if (process.env.PORTRAIT_SCREENSHOTS && [390, 768, 1024, 1152, 1440].includes(width)) {
      const heights: Record<number, number> = { 390: 844, 768: 1200, 1024: 1600, 1152: 2048, 1440: 1000 };
      await page.setViewportSize({ width, height: heights[width] });
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
        await page.screenshot({ path: `/tmp/grant-portrait-after-${width}-${theme}.png`, fullPage: true });
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    for (const row of await rows.all()) {
      expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    }
  }
});

test("long content, enlarged text and themes remain readable", async ({ page }) => {
  await setup(page, true);
  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1200 : 1600 });
    await page.addStyleTag({ content: "html { font-size: 200% }" });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      const rows = page.locator(".detail-history-row");
      for (const row of await rows.all()) {
        expect(await row.evaluate((el) => {
          const cells = [...el.children].map((cell) => cell.getBoundingClientRect());
          return el.scrollWidth <= el.clientWidth && cells.every((a, i) => cells.slice(i + 1).every((b) => a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1));
        })).toBeTruthy();
      }
      await expect(page.getByRole("button", { name: "精算", exact: true }).first()).toBeVisible();
      await expect(page.locator("#planned-item-201")).toContainText("放棄");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
      if (process.env.PORTRAIT_SCREENSHOTS) await page.screenshot({ path: `/tmp/grant-portrait-after-${width}-${theme}-200.png`, fullPage: true });
    }
  }
});

test("resizing preserves filter, sort and an open editing dialog", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1600 });
  await setup(page);
  let requests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/funds/1")) requests++; });
  const search = page.locator(".detail-list-filter-input");
  await search.fill("予定1");
  const table = page.getByRole("table", { name: "予定" });
  await table.getByRole("button", { name: /金額/ }).click();
  const sort = table.getByRole("button", { name: /金額/ });
  await expect(sort).toHaveAttribute("aria-pressed", "true");
  await table.getByRole("button", { name: "編集" }).click();
  const dialog = page.getByRole("dialog", { name: "予定を編集" });
  await dialog.getByLabel("内容").fill("編集中の内容");
  const requestsBeforeResize = requests;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setViewportSize({ width: 1024, height: 1600 });
  await expect(dialog.getByLabel("内容")).toHaveValue("編集中の内容");
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("予定1");
  await expect(sort).toHaveAttribute("aria-pressed", "true");
  expect(requests).toBe(requestsBeforeResize);
});

test("pinned note survives resizing and keyboard operation", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1600 });
  await setup(page, false, true);
  const entry = page.locator("#planned-item-101");
  await entry.focus();
  await entry.press("Enter");
  await expect(entry.getByRole("note")).toHaveText("幅変更後も残るメモ");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(entry.getByRole("note")).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 1600 });
  await expect(entry.getByRole("note")).toBeVisible();
  await entry.press("Space");
  await expect(entry.getByRole("note")).toHaveCount(0);
});

test("history actions remain reachable during processing and after an error", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const history = page.getByRole("table", { name: "完了・取消済項目一覧" });
  const row = history.locator("#planned-item-202");
  for (const action of ["restore", "delete"] as const) {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const url = action === "restore" ? "**/api/planned-items/202/restore" : "**/api/planned-items/202";
    await page.route(url, async (route) => {
      await gate;
      await route.fulfill({ status: 400, json: { code: "test_error", message: "操作に失敗しました" } });
    });
    await row.getByRole("button", { name: action === "restore" ? "再計画" : "削除", exact: true }).click();
    const pending = row.getByRole("button", { name: action === "restore" ? "再計画中..." : "削除中..." });
    await expect(pending).toBeDisabled();
    if (process.env.PORTRAIT_SCREENSHOTS) await page.screenshot({ path: `/tmp/grant-portrait-${action}-pending.png`, fullPage: true });
    release();
    const section = page.getByRole("region", { name: "完了・取消済項目一覧" });
    await expect(section.getByRole("alert")).toHaveText("操作に失敗しました");
    await expect(row.getByRole("button", { name: action === "restore" ? "再計画" : "削除", exact: true })).toBeEnabled();
    if (process.env.PORTRAIT_SCREENSHOTS) await page.screenshot({ path: `/tmp/grant-portrait-${action}-error.png`, fullPage: true });
    await page.unroute(url);
  }
});


test("amount and note display settings work in both layouts", async ({ page }) => {
  await setup(page, false, true);
  for (const [amountDisplayMode, formatted, notesDisplayMode] of [
    ["grouped-yen", "100,000円", "hover"],
    ["plain-yen", "100000円", "click"],
    ["thousand-yen", "100千円", "expanded"],
  ]) {
    await page.evaluate(({ amountDisplayMode, notesDisplayMode }) => {
      const key = "budget-dashboard:settings";
      const settings = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify({ ...settings, amountDisplayMode, notesDisplayMode }));
    }, { amountDisplayMode, notesDisplayMode });
    await page.reload();
    const entry = page.locator("#planned-item-101");
    for (const width of [390, 1024]) {
      await page.setViewportSize({ width, height: 1200 });
      for (const row of await page.locator(".detail-history-row").all()) {
        await expect(row.locator(".detail-history-amount")).toHaveText(formatted);
      }
      if (notesDisplayMode === "hover") {
        await entry.hover();
        await expect(entry.getByRole("note")).toBeVisible();
        await page.mouse.move(0, 0);
      } else if (notesDisplayMode === "click") {
        await entry.locator(".detail-history-description").click();
        await expect(entry.getByRole("note")).toBeVisible();
        await entry.locator(".detail-history-description").click();
      } else {
        await expect(entry.getByRole("note")).toBeVisible();
      }
    }
  }
});
