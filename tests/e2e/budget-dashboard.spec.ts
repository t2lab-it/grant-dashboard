import { expect, test } from "@playwright/test";
import { formatTokyoDateKey } from "../../src/lib/calendar";

test("overview to fund detail to form flow works", async ({ page }) => {
  const today = formatTokyoDateKey(new Date()).replaceAll("-", "/");
  const overviewResponsePromise = page.waitForResponse("**/api/overview");
  await page.goto("/");
  const overviewResponse = await overviewResponsePromise;

  expect(overviewResponse.status()).toBe(200);
  await expect(page.getByText("研究予算ダッシュボード")).toBeVisible();
  await page.getByRole("button", { name: "今回は始めない" }).click();
  const fundResponsePromise = page.waitForResponse("**/api/funds/1");
  await page.getByRole("link", { name: /デモ研究費A/ }).click();
  const fundResponse = await fundResponsePromise;

  expect(fundResponse.status()).toBe(200);
  await expect(page.getByRole("table", { name: "費目別の状況" }).getByText("物品費")).toBeVisible();
  await page.getByRole("link", { name: "研究予算ダッシュボード" }).click();

  await expect(page).toHaveURL(/\/\?year=2026$/);
  await expect(page.getByRole("link", { name: "研究予算ダッシュボード" })).toHaveAttribute("href", "/?year=2026");
  await expect(page.getByRole("link", { name: /デモ研究費A/ })).toBeVisible();
  await page.getByRole("link", { name: "予定を追加" }).click();
  const plannedItemForm = page.getByTestId("tour-target-planned-item-form");
  const plannedDateInput = plannedItemForm.getByRole("textbox", { name: "立案日", exact: true });
  await plannedItemForm.getByLabel("予算").selectOption({ label: "デモ研究費A" });
  await plannedItemForm.getByLabel("費目").selectOption({ label: "物品費" });
  await expect(plannedDateInput).toHaveValue(today);
  await plannedDateInput.fill("2026/10/01");
  await plannedItemForm.getByRole("textbox", { name: "執行予定月", exact: true }).fill("2026/10");
  await plannedItemForm.getByLabel("内容").fill("追加出張");
  await plannedItemForm.getByLabel("金額").fill("50000");
  const submitResponsePromise = page.waitForResponse("**/api/planned-items");
  await plannedItemForm.getByLabel("金額").press("Enter");
  const submitResponse = await submitResponsePromise;
  const exportResponse = await page.request.get("/api/exports/json");
  const exportPayload = await exportResponse.json();

  expect(submitResponse.status()).toBe(201);
  expect(exportResponse.status()).toBe(200);
  expect(Object.keys(exportPayload)).toEqual([
    "funds",
    "categories",
    "budget_lines",
    "planned_items",
    "actual_entries",
  ]);
  expect(exportPayload.funds).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 1, name: "デモ研究費A" })]),
  );
  expect(exportPayload.planned_items).toEqual(
    expect.arrayContaining([expect.objectContaining({ description: "追加出張", amount: 50000 })]),
  );
});

test("overview category selection uses the real API and toggles back with keyboard controls", async ({ page }) => {
  await page.goto("/?year=2026");
  const dismiss = page.getByRole("button", { name: "今回は始めない" });
  await dismiss.click();
  const hero = page.getByRole("group", { name: "年度全体の指標" });
  await expect(hero.getByRole("button", { pressed: true })).toHaveCount(0);
  const standardChart = page.getByRole("img", { name: "デモ研究費A の予算内訳" });
  const standardSize = await standardChart.boundingBox();
  const standardRing = await standardChart.locator("circle:not([stroke-dasharray])").boundingBox();
  expect(standardSize).not.toBeNull();
  expect(standardRing).not.toBeNull();
  const requests: string[] = [];
  page.on("request", (request) => { if (/\/api\/(overview|funds\/)/.test(request.url())) requests.push(request.url()); });
  for (const label of ["費目予算", "消化額"]) {
    const button = hero.getByRole("button", { name: new RegExp(`^${label} `) });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(hero.getByRole("button", { pressed: true })).toHaveCount(1);
    const chart = page.getByRole("img", { name: `デモ研究費A の${label}の大費目別内訳グラフ` });
    await expect(chart).toBeVisible();
    if (label === "費目予算") {
      const size = await chart.boundingBox();
      const ring = await chart.locator("circle:not([stroke-dasharray])").boundingBox();
      expect(size?.width).toBeCloseTo(standardSize!.width, 0);
      expect(size?.height).toBeCloseTo(standardSize!.height, 0);
      expect(ring?.width).toBeCloseTo(standardRing!.width, 0);
      expect(ring?.height).toBeCloseTo(standardRing!.height, 0);
    }
    await expect(page.getByLabel("予算の共通凡例")).toBeVisible();
    await expect(page.getByRole("heading", { name: `${label}の内訳` })).toBeVisible();
  }
  await page.keyboard.press("Space");
  await expect(hero.getByRole("button", { pressed: true })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "デモ研究費A の予算内訳" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "費目予算の内訳" })).toBeVisible();
  expect(requests).toEqual([]);
  await hero.getByRole("button", { name: /^消化額 / }).click();
  await expect(hero.getByRole("button", { name: /^消化額 [\d,]+円$/ })).toBeVisible();
  await page.getByRole("button", { name: "2026年6月の月ラベルから消化額サマリを開く" }).click();
  await expect(page).toHaveURL(/summaryMetric=consumed/);
  const dialog = page.getByRole("dialog", { name: "2026年6月の予算横断サマリ" });
  await expect(dialog.getByRole("table", { name: "予算別一覧" }).getByRole("columnheader", { name: "執行＋予定の累計" })).toHaveAttribute("data-highlighted", "true");
  await dialog.getByRole("button", { name: "翌月" }).click();
  await expect(page.getByRole("dialog", { name: "2026年7月の予算横断サマリ" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("demo tutorial starts on overview and moves to fund detail", async ({ page }) => {
  const overviewResponsePromise = page.waitForResponse("**/api/overview");
  await page.goto("/");
  const overviewResponse = await overviewResponsePromise;

  expect(overviewResponse.status()).toBe(200);
  expect(await overviewResponse.json()).toMatchObject({ tutorial: { eligibleDemoData: true } });

  const prompt = page.getByRole("dialog", { name: "チュートリアルを始めますか？" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "チュートリアルを始める" }).click();

  const tutorial = page.getByRole("dialog", { name: "チュートリアル" });
  await expect(tutorial.getByText("費目予算の内訳")).toBeVisible();
  await expect(page.getByTestId("tour-target-overview-summary").getByRole("heading", { name: "費目予算の内訳" })).toBeVisible();

  await tutorial.getByRole("button", { name: "次へ" }).click();
  const fundResponsePromise = page.waitForResponse("**/api/funds/1");
  await tutorial.getByRole("button", { name: "次へ" }).click();
  const fundResponse = await fundResponsePromise;

  expect(fundResponse.status()).toBe(200);
  await expect(page).toHaveURL(/\/funds\/1\?year=2026$/);
  await expect(tutorial.getByText("予定と実績の一覧")).toBeVisible();
  await expect(page.getByRole("heading", { name: "予定", exact: true })).toBeVisible();
});

test("aligns fiscal-year fund donuts and legends with different fund counts", async ({ page }) => {
  await page.goto("/fiscal-years?year=2026");

  await expect(page.getByRole("heading", { name: "予算構成" })).toBeVisible();
  const cards = page.locator(".fiscal-year-fund-card");
  await expect(cards).toHaveCount(3);

  const donutTops = await cards.locator(".fiscal-year-fund-donut").evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().top)),
  );
  const legendTops = await cards.locator(".fiscal-year-fund-list, .fiscal-year-fund-empty").evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().top)),
  );

  expect(new Set(donutTops).size).toBe(1);
  expect(new Set(legendTops).size).toBe(1);
});

for (const width of [390, 768, 1440]) {
  test(`keeps all pages within the viewport at ${width}px and lets comparison tables scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/?year=2026", "/funds/1?year=2026", "/search?year=2026", "/fiscal-years?year=2026", "/settings?year=2026", "/funds/new?year=2026", "/planned-items/new?year=2026", "/actual-entries/new?year=2026", "/imports", "/imports/1"]) {
      await page.goto(path);
      await expect(page.locator("main")).not.toContainText("読み込み中");
      const dismiss = page.getByRole("button", { name: "今回は始めない" });
      if (await dismiss.isVisible()) await dismiss.click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width);
      if (path === "/?year=2026") {
        const sharedLegend = page.getByLabel("予算の共通凡例");
        const cardLegend = page.locator(".overview-fund-card-legend").first();
        await expect(sharedLegend).toBeVisible();
        await expect(cardLegend).not.toBeVisible();
        const add = await page.getByRole("link", { name: "＋ 予算を追加" }).boundingBox();
        const ledger = await page.getByRole("link", { name: "収支簿出力" }).boundingBox();
        expect(add).not.toBeNull();
        expect(ledger).not.toBeNull();
        expect(ledger!.y + ledger!.height / 2).toBeCloseTo(add!.y + add!.height / 2, 0);
        const displayToggle = page.getByRole("group", { name: "表示切り替え" });
        const standardPosition = await displayToggle.boundingBox();
        const headingPosition = await page.getByRole("heading", { name: "予算", exact: true }).boundingBox();
        const tagSelect = page.getByRole("combobox", { name: "研究プロジェクトタグ" });
        const tagPosition = await tagSelect.boundingBox();
        const controlsPosition = await page.locator(".overview-section-controls").boundingBox();
        expect(standardPosition).not.toBeNull();
        expect(headingPosition).not.toBeNull();
        expect(standardPosition!.x).toBeCloseTo(headingPosition!.x, 0);
        expect(tagPosition).not.toBeNull();
        expect(controlsPosition).not.toBeNull();
        expect(tagPosition!.x + tagPosition!.width).toBeCloseTo(controlsPosition!.x + controlsPosition!.width, 0);
        const consumed = page.getByRole("button", { name: /^消化額 / });
        await consumed.click();
        await expect(page.getByRole("group", { name: "率表示" })).toHaveCount(0);
        const categoryPosition = await displayToggle.boundingBox();
        expect(categoryPosition?.x).toBeCloseTo(standardPosition!.x, 0);
        expect(categoryPosition?.y).toBeCloseTo(standardPosition!.y, 0);
        const categoryTagPosition = await tagSelect.boundingBox();
        expect(categoryTagPosition?.x).toBeCloseTo(tagPosition!.x, 0);
        expect(categoryTagPosition?.y).toBeCloseTo(tagPosition!.y, 0);
        const numericButton = displayToggle.getByRole("button", { name: "数値", exact: true });
        await numericButton.focus();
        await page.keyboard.press("Tab");
        await expect(tagSelect).toBeFocused();
        await consumed.click();
        await numericButton.focus();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: "予算消化率", exact: true })).toBeFocused();
      }
      if (path === "/settings?year=2026") {
        await expect(page.locator(".overview-fund-card-legend").first()).toBeVisible();
      }
      for (const region of await page.locator(".comparison-scroll").all()) {
        await region.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
        const extent = await region.evaluate((element) => ({ end: element.scrollLeft + element.clientWidth, width: element.scrollWidth }));
        expect(extent.end).toBeGreaterThanOrEqual(extent.width - 1);
      }
    }
  });
}

test("preserves form input on failure, saves and reloads it, then settles only the requested amount", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/funds/1?year=2026");
  const existingEdit = page.getByRole("region", { name: "予定", exact: true }).getByRole("button", {name: "編集", exact: true}).first();
  await existingEdit.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", {name: "予定を編集"})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(existingEdit).toBeFocused();
  await page.getByRole("region", { name: "予定", exact: true }).getByRole("link", { name: "予定を追加" }).click();
  const form = page.getByRole("dialog", { name: "予定を追加" });
  await form.getByLabel("費目", { exact: true }).selectOption({ label: "物品費" });
  await form.getByRole("textbox", { name: "執行予定月", exact: true }).fill("2026/10");
  await form.getByLabel("内容", { exact: true }).fill("回帰確認の購入予定");
  await form.getByLabel("金額", { exact: true }).fill("10000");
  await page.route("**/api/planned-items", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "storage_unavailable", message: "保存先に書き込めません" }) }), { times: 1 });
  await form.getByRole("button", { name: "保存", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("保存先に書き込めません");
  await expect(form.getByLabel("内容", { exact: true })).toHaveValue("回帰確認の購入予定");
  await expect(form.getByLabel("金額", { exact: true })).toHaveValue("10000");
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/planned-items") && response.request().method() === "POST");
  await form.getByRole("button", { name: "保存", exact: true }).click();
  expect((await saved).status()).toBe(201);
  await form.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page).toHaveURL(/\/funds\/1\?year=2026$/);
  await page.reload();
  const row = page.locator(".detail-history-entry").filter({ hasText: "回帰確認の購入予定" });
  await expect(row).toContainText("10,000円");
  await row.getByRole("button", { name: "精算", exact: true }).click();
  const settlement = page.getByRole("dialog", { name: "予定を精算" });
  await settlement.getByLabel("金額", { exact: true }).fill("4000");
  await settlement.getByRole("checkbox", { name: "残額を予定として残す" }).check();
  const settled = page.waitForResponse((response) => response.url().endsWith("/api/actual-entries") && response.request().method() === "POST");
  await settlement.getByRole("button", { name: "精算を登録" }).click();
  const settlementResponse = await settled;
  expect(settlementResponse.status()).toBe(201);
  expect(settlementResponse.request().postDataJSON()).toMatchObject({ amount: 4000, keepRemainingPlanned: true });
  await expect(settlement).not.toBeVisible();
  const planned = page.getByRole("region", { name: "予定", exact: true }).locator(".detail-history-entry").filter({ hasText: "回帰確認の購入予定" });
  await expect(planned).toContainText("6,000円");
  await planned.getByRole("button", { name: "編集", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "予定を編集" });
  await expect(edit).toContainText("金額（未精算残額）");
  await expect(edit.getByLabel("金額", { exact: true })).toHaveValue("6000");
  await page.keyboard.press("Escape");
  await expect(planned.getByRole("button", { name: "編集", exact: true })).toBeFocused();
  const data = await (await page.request.get("/api/funds/1")).json();
  expect(data.plannedItems.find((item: { description: string }) => item.description === "回帰確認の購入予定").amount).toBe(6000);
  expect(data.actualEntries.find((item: { description: string }) => item.description === "回帰確認の購入予定").amount).toBe(4000);
  await page.goto("/search?year=2026&keyword=回帰確認の購入予定");
  await page.getByRole("link", { name: /予定.*回帰確認|回帰確認.*予定/ }).first().click();
  await expect(page.locator('[data-search-focus="true"]')).toContainText("回帰確認の購入予定");
});

test("keeps a directly opened balance monthly summary above the startup prompt and follows year links", async ({ page }) => {
  await page.goto("/?year=2026&month=2026-06&summaryMetric=balance");
  const summary = page.getByRole("dialog", { name: "2026年6月の予算横断サマリ" });
  await expect(summary).toBeVisible();
  await expect(page.getByRole("dialog", { name: "チュートリアルを始めますか？" })).not.toBeVisible();
  await expect(summary).toContainText("過去時点の保存値ではありません");
  await summary.getByRole("button", { name: "月別サマリを閉じる" }).click();
  await page.getByRole("button", { name: "今回は始めない" }).click();
  await page.getByRole("button", { name: "年度比較", exact: true }).click();
  await page.getByRole("link", { name: "2025年度の年度ページを開く", exact: true }).first().click();
  await expect(page).toHaveURL(/year=2025/);
  await expect(page.getByRole("combobox", { name: "年度", exact: true })).toHaveValue("2025");
});

test("imports, reads fiscal-year history and exports the isolated workbook with a shared diff table", async ({ page }) => {
  await page.goto("/imports?year=2026");
  await page.getByRole("button", { name: "インポート", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "workbook をインポート" });
  await dialog.getByLabel(".xlsx ファイル").setInputFiles("seeds/demo/demo-budget.xlsx");
  let releasePreview: () => void = () => {};
  const previewGate = new Promise<void>((resolve) => { releasePreview = resolve; });
  await page.route("**/api/imports/workbook/preview", async (route) => {
    const response = await route.fetch();
    await previewGate;
    await route.fulfill({response});
  });
  await dialog.getByRole("button", { name: "プレビュー", exact: true }).click();
  await expect(dialog.getByLabel(".xlsx ファイル")).toBeDisabled();
  releasePreview();
  await expect(dialog).toContainText("予算 8");
  await expect(dialog).toContainText("現在の登録内容は失われます");
  const imported = page.waitForResponse((response) => response.url().endsWith("/api/imports/workbook"));
  await dialog.getByRole("button", { name: "既存データを置換して取り込む" }).click();
  const response = await imported;
  expect(response.status()).toBe(201);
  await expect(dialog).not.toBeVisible();
  const history = await (await page.request.get("/api/imports")).json();
  await page.goto(`/imports/${history[0].id}?year=2026`);
  for (const year of [2025, 2026, 2027]) await expect(page.getByRole("table", { name: `${year}年度の予算別照合` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("table", { name: "2026年度の予算別照合" })).toContainText("2,400,000円");
  await page.getByRole("button", { name: "エクスポート", exact: true }).click();
  const exporting = page.getByRole("dialog", { name: "取込済みExcelを上書き保存" });
  await expect(exporting.getByRole("table", { name: "Excel差分" })).toBeVisible();
  await expect(exporting).toContainText("以前の内容は失われます");
  await exporting.getByRole("button", { name: "上書き保存", exact: true }).click();
  await expect(exporting).not.toBeVisible();
});

test("supports 200% text without overflowing settings, history or fiscal-year values", async ({ page }) => {
  for (const width of [390, 768]) {
    await page.setViewportSize({width, height: 1000});
    for (const path of ["/settings?year=2026", "/imports/1?year=2026", "/fiscal-years?year=2026"]) {
      await page.goto(path);
      await expect(page.locator("main")).not.toContainText("読み込み中");
      await page.addStyleTag({content: "html {font-size:200% !important;}"});
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width);
      for (const value of await page.locator(".fiscal-year-budget-value").all()) {
        expect(await value.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      }
    }
  }
});

test("keeps long budget names, classification tags and large amounts within the overview", async ({ page }) => {
  await page.setViewportSize({width: 390, height: 1000});
  await page.route("**/api/overview?year=2026", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.tutorial.eligibleDemoData = false;
    for (const fund of data.funds) {
      fund.name += "研究プロジェクト".repeat(20) + "UnbrokenIdentifier".repeat(20);
      for (const tag of fund.projectTags) tag.name += "UnbrokenClassification".repeat(20);
    }
    data.crossAggregateCategories[0].budgetAmount = 4200000000000;
    for (const row of data.crossAggregateCategories.slice(1)) row.budgetAmount = null;
    await route.fulfill({response, json: data});
  });
  await page.goto("/?year=2026");
  await expect(page.getByRole("button", {name: /^費目予算 /})).toContainText("4,200,000,000,000円");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
