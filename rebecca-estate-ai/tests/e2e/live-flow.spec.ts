import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * 真實 Supabase 端對端流程（驗收 3、4、5、1）。
 * 需要：NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY、SUPABASE_SERVICE_ROLE_KEY，
 * 並設定 E2E_ALLOW_WRITE=1（會在專案中建立測試帳號與資料，結束後自動刪除）。
 * 建議使用專門測試用的 Supabase 專案。
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = !!url && !!serviceKey && process.env.E2E_ALLOW_WRITE === "1";

test.describe.configure({ mode: "serial" });
test.skip(!enabled, "未設定 Supabase 測試憑證或未允許寫入（E2E_ALLOW_WRITE=1）");

const stamp = Date.now().toString(36);
const password = `E2e-${stamp}-pass!`;
const owner = { email: `rea-e2e-owner-${stamp}@example.com`, name: "測試庭妍" };
const outsider = { email: `rea-e2e-outsider-${stamp}@example.com`, name: "外部測試" };
const slug = `e2e-${stamp}`;
const otherSlug = `e2e-other-${stamp}`;
const userIds: string[] = [];

function admin() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入" }).click();
}

async function createWorkspace(page: Page, name: string, s: string) {
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("工作空間名稱").fill(name);
  await page.getByLabel(/網址代號/).fill(s);
  await page.getByRole("button", { name: "建立工作空間" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${s}/dashboard$`));
}

test.beforeAll(async () => {
  const a = admin();
  for (const u of [owner, outsider]) {
    const { data, error } = await a.auth.admin.createUser({ email: u.email, password, email_confirm: true, user_metadata: { display_name: u.name } });
    if (error) throw error;
    userIds.push(data.user.id);
  }
});

test.afterAll(async () => {
  if (!enabled) return;
  const a = admin();
  await a.from("tenants").delete().in("slug", [slug, otherSlug]);
  for (const id of userIds) await a.auth.admin.deleteUser(id);
});

test("登入 → 建立工作空間 → Dashboard 真實資料", async ({ page }) => {
  await login(page, owner.email);
  await createWorkspace(page, "E2E 測試工作室", slug);
  await expect(page.getByRole("heading", { name: new RegExp(owner.name) })).toBeVisible();

  await page.getByRole("button", { name: "待辦" }).click();
  await page.getByLabel("待辦內容").fill("E2E 回電地主");
  await page.getByLabel("優先").selectOption("1");
  await page.getByRole("button", { name: "新增", exact: true }).click();
  await expect(page.getByText("已新增：E2E 回電地主")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "E2E 回電地主" })).toBeVisible();
});

test("驗收 3：物件保存、未知欄位顯示待確認、搜尋、修改、封存", async ({ page }) => {
  await login(page, owner.email);
  await page.goto(`/w/${slug}/properties/new`);
  await page.getByLabel(/案件名稱/).fill("E2E 北屯建地");
  await page.getByLabel(/物件類型/).selectOption("building_land");
  await page.getByLabel("地址／位置").fill("台中市北屯區崇德路三段 100 號");
  await page.getByLabel("開價（萬）").fill("3680");
  await page.getByLabel("內部底價（萬）").fill("3300");
  await page.getByRole("button", { name: "建立物件" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/properties/[0-9a-f-]{36}$`));
  await expect(page.getByText("3,680 萬").first()).toBeVisible();
  await expect(page.getByText("3,300 萬")).toBeVisible();
  await expect(page.getByText("待確認").first()).toBeVisible();

  // 重複案件提醒
  await page.goto(`/w/${slug}/properties/new`);
  await page.getByLabel(/案件名稱/).fill("另一個名字");
  await page.getByLabel(/物件類型/).selectOption("building_land");
  await page.getByLabel("地址／位置").fill("臺中市北屯區崇德路三段100號");
  await page.getByRole("button", { name: "建立物件" }).click();
  await expect(page.getByText("可能是重複資料")).toBeVisible();

  await page.goto(`/w/${slug}/properties?q=崇德路`);
  await page.getByRole("link", { name: /E2E 北屯建地/ }).click();
  await page.getByRole("link", { name: "編輯" }).click();
  await page.getByLabel("開價（萬）").fill("3580");
  await page.getByRole("button", { name: "儲存變更" }).click();
  await expect(page.getByText("3,680 萬 → ")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "封存" }).click();
  await expect(page.getByText("已封存")).toBeVisible();
  await page.goto(`/w/${slug}/properties`);
  await expect(page.getByRole("link", { name: /E2E 北屯建地/ })).toHaveCount(0);
});

test("驗收 4：買方、聯絡資訊遮罩、真實聯繫紀錄、多筆需求", async ({ page }) => {
  await login(page, owner.email);
  await page.goto(`/w/${slug}/contacts/new?type=buyer`);
  await page.getByLabel(/姓名／稱呼/).fill("E2E 陳董");
  await page.getByLabel("電話", { exact: true }).fill("0912-345-678");
  await page.getByRole("button", { name: "建立客戶" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/contacts/[0-9a-f-]{36}$`));
  await expect(page.getByText("0912-***-678")).toBeVisible();
  await expect(page.getByText("未聯繫")).toBeVisible();

  await page.getByLabel("實際接通／見到本人").check();
  await page.getByLabel(/摘要/).fill("確認預算 3000 萬內");
  await page.getByRole("button", { name: "記錄" }).click();
  await expect(page.getByText("已記錄")).toBeVisible();
  await page.reload();
  await expect(page.getByText("已聯繫").first()).toBeVisible();

  for (const title of ["自住透天", "投資建地"]) {
    await page.getByRole("link", { name: "新增需求" }).click();
    await page.getByLabel(/需求名稱/).fill(title);
    await page.getByRole("button", { name: "建立需求" }).click();
    await expect(page.getByText(title)).toBeVisible();
  }
  await expect(page.getByText("買方需求（2）")).toBeVisible();
});

test("任務頁回顧檢視、設定頁邀請連結", async ({ page }) => {
  await login(page, owner.email);
  await page.goto(`/w/${slug}/tasks?view=review`);
  await expect(page.getByText("今日完成")).toBeVisible();
  await page.goto(`/w/${slug}/settings`);
  await page.getByLabel("Email").fill(`rea-e2e-invitee-${stamp}@example.com`);
  await page.getByRole("button", { name: "建立邀請連結" }).click();
  await expect(page.getByLabel("邀請連結")).toHaveValue(/\/invite\/[0-9a-f]{64}$/);
});

test("驗收 1：其他租戶的使用者無法進入此工作空間", async ({ page }) => {
  await login(page, outsider.email);
  await createWorkspace(page, "外部工作室", otherSlug);
  await page.goto(`/w/${slug}/dashboard`);
  await expect(page.getByRole("heading", { name: "找不到頁面" })).toBeVisible();
  await page.goto(`/w/${slug}/properties`);
  await expect(page.getByRole("heading", { name: "找不到頁面" })).toBeVisible();
});
