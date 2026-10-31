import { expect, test } from "@playwright/test";

/**
 * 無 Supabase 憑證也能執行的冒煙測試：
 * 未設定憑證時不得出現假功能，受保護頁面一律導向設定說明。
 * （登入後流程需真實 Supabase，見 docs/TESTING.md）
 */
const supabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

test.describe("未設定憑證時的行為", () => {
  test.skip(supabaseConfigured, "此組測試只在未設定 Supabase 時執行");

  test("首頁導向設定說明", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole("heading", { name: "連接雲端資料庫" })).toBeVisible();
    await expect(page.getByText("尚未設定，所有功能未啟用")).toBeVisible();
  });

  test("工作空間頁面不可直接進入", async ({ page }) => {
    for (const path of [
      "/w/any-tenant/dashboard",
      "/w/any-tenant/properties",
      "/w/any-tenant/properties/new",
      "/w/any-tenant/contacts/00000000-0000-0000-0000-000000000000",
      "/w/any-tenant/activities/new",
      "/w/any-tenant/tasks?view=review",
      "/w/any-tenant/settings",
      "/onboarding",
      "/invite/abc",
    ]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/setup$/);
    }
  });

  test("註冊表單保留邀請回跳路徑，且拒絕站外網址", async ({ page }) => {
    await page.goto("/signup?next=/invite/abc");
    await expect(page.locator('input[name="next"]')).toHaveValue("/invite/abc");
    await page.goto("/signup?next=https://evil.example");
    await expect(page.locator('input[name="next"]')).toHaveValue("/onboarding");
  });

  test("登入表單顯示驗證錯誤與未設定提示", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "登入" }).click();
    await expect(page.getByText("請輸入有效的 Email")).toBeVisible();

    await page.getByLabel("Email").fill("agent@example.test");
    await page.getByLabel("密碼").fill("password123");
    await page.getByRole("button", { name: "登入" }).click();
    await expect(page.getByText("系統尚未連接 Supabase")).toBeVisible();
    // 送出失敗後保留已輸入的 Email，不需重打
    await expect(page.getByLabel("Email")).toHaveValue("agent@example.test");
  });
});

test("PWA manifest 與 service worker 可取得", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const json = await manifest.json();
  expect(json.name).toBe("陳庭妍 AI 房仲智慧系統");
  expect(json.display).toBe("standalone");
  expect(json.icons.length).toBeGreaterThanOrEqual(2);
  for (const icon of json.icons) {
    expect((await request.get(icon.src)).ok(), icon.src).toBeTruthy();
  }
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
  expect((await request.get("/offline.html")).ok()).toBeTruthy();
});

test("排程端點未帶密鑰時拒絕", async ({ request }) => {
  const res = await request.get("/api/cron/daily");
  expect(res.status()).toBe(401);
  const res2 = await request.get("/api/cron/daily", { headers: { authorization: "Bearer wrong" } });
  expect(res2.status()).toBe(401);
});

test("登出只接受 POST", async ({ request }) => {
  const res = await request.get("/auth/signout", { maxRedirects: 0 });
  expect(res.status()).toBe(405);
});

test("手機寬度無水平捲動", async ({ page }) => {
  for (const path of ["/login", "/signup", "/setup"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
