import { expect, test } from "@playwright/test";

test("overview to fund detail to form flow works", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
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
  await expect(page.getByRole("link", { name: "Overview" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "研究予算ダッシュボード" })).toHaveAttribute("href", "/?year=2026");
  await expect(page.getByRole("link", { name: /デモ研究費A/ })).toBeVisible();
  await page.getByRole("link", { name: "予定作成" }).click();
  const plannedItemForm = page.getByTestId("tour-target-planned-item-form");
  const plannedDateInput = plannedItemForm.getByRole("textbox", { name: "立案日", exact: true });
  await plannedItemForm.getByLabel("資金").selectOption({ label: "デモ研究費A" });
  await plannedItemForm.getByLabel("費目").selectOption({ label: "物品費" });
  await expect(plannedDateInput).toHaveValue(today);
  await plannedDateInput.fill("2026/10/01");
  await plannedItemForm.getByLabel("執行予定月").fill("2026-10");
  await plannedItemForm.getByLabel("説明").fill("追加出張");
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
  await expect(page.getByText("予定項目を保存できませんでした。")).toHaveCount(0);
});

test("demo tutorial starts on overview and moves to fund detail", async ({ page }) => {
  const overviewResponsePromise = page.waitForResponse("**/api/overview");
  await page.goto("/");
  const overviewResponse = await overviewResponsePromise;

  expect(overviewResponse.status()).toBe(200);

  const prompt = page.getByRole("dialog", { name: "チュートリアルを始めますか？" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "チュートリアルを始める" }).click();

  const tutorial = page.getByRole("dialog", { name: "チュートリアル" });
  await expect(tutorial.getByText("予算総額の分析")).toBeVisible();
  await expect(page.getByTestId("tour-target-overview-summary").getByRole("heading", { name: "予算総額の分析" })).toBeVisible();

  await tutorial.getByRole("button", { name: "次へ" }).click();
  const fundResponsePromise = page.waitForResponse("**/api/funds/1");
  await tutorial.getByRole("button", { name: "次へ" }).click();
  const fundResponse = await fundResponsePromise;

  expect(fundResponse.status()).toBe(200);
  await expect(page).toHaveURL(/\/funds\/1\?year=2026$/);
  await expect(tutorial.getByText("予定と実績の一覧")).toBeVisible();
  await expect(page.getByRole("heading", { name: "計画項目一覧" })).toBeVisible();
});
