import { expect, test } from "@playwright/test";

test.describe("media upload PoC UI", () => {
  test("shows heading and control buttons", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "メディアアップロード PoC" })).toBeVisible();
    await expect(page.getByRole("button", { name: "プリサインのみ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "サムネ生成＋S3 二段 PUT" })).toBeVisible();
    await expect(page.getByRole("button", { name: "動画のみ PUT" })).toBeVisible();
  });
});
