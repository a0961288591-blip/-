import { describe, expect, it } from "vitest";
import { credentialsSchema, quickTaskSchema, safeNextPath, tenantSchema } from "@/lib/validation";

describe("表單驗證", () => {
  it("工作空間網址代號規則與資料庫一致", () => {
    expect(tenantSchema.safeParse({ name: "庭妍工作室", slug: "rebecca-land", kind: "solo" }).success).toBe(true);
    expect(tenantSchema.safeParse({ name: "x", slug: "Rebecca-Land", kind: "solo" }).data?.slug).toBe("rebecca-land");
    for (const bad of ["ab", "-abc", "中文名稱", "a".repeat(41), "abc_def"]) {
      expect(tenantSchema.safeParse({ name: "x", slug: bad, kind: "solo" }).success, bad).toBe(false);
    }
    expect(tenantSchema.safeParse({ name: "   ", slug: "abc", kind: "solo" }).success).toBe(false);
  });

  it("帳密驗證", () => {
    expect(credentialsSchema.safeParse({ email: "a@b.tw", password: "12345678" }).success).toBe(true);
    expect(credentialsSchema.safeParse({ email: "a@b.tw", password: "1234567" }).success).toBe(false);
    expect(credentialsSchema.safeParse({ email: "not-email", password: "12345678" }).success).toBe(false);
  });

  it("快速待辦：datetime-local 以台北時間解讀", () => {
    const r = quickTaskSchema.parse({ title: " 回電林董 ", priority: "1", dueAt: "2026-11-02T14:30" });
    expect(r).toEqual({ title: "回電林董", priority: 1, dueAt: "2026-11-02T06:30:00.000Z" });
    expect(quickTaskSchema.parse({ title: "x", priority: "2" }).dueAt).toBeNull();
    expect(quickTaskSchema.safeParse({ title: "", priority: "2" }).success).toBe(false);
    expect(quickTaskSchema.safeParse({ title: "x", priority: "9" }).success).toBe(false);
  });

  it("登入後導向只允許站內路徑（防 open redirect）", () => {
    expect(safeNextPath("/w/abc/dashboard")).toBe("/w/abc/dashboard");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(null, "/login")).toBe("/login");
  });
});
