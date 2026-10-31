import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** 靜態檢查：管理金鑰與 AI 金鑰不得出現在前端可存取的程式碼 */
const SRC = join(__dirname, "..", "..", "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

describe("金鑰不外洩到前端", () => {
  it("沒有任何 NEXT_PUBLIC_ 形式的 service role 或 OpenAI 金鑰", () => {
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      expect(s, relative(SRC, f)).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET|OPENAI)/);
    }
  });

  it("使用 service role 的檔案都標記 server-only，且不是 client component", () => {
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      if (!s.includes("SUPABASE_SERVICE_ROLE_KEY") && !s.includes("OPENAI_API_KEY")) continue;
      expect(s, relative(SRC, f)).toContain('import "server-only"');
      expect(s, relative(SRC, f)).not.toMatch(/^["']use client["']/m);
    }
  });

  it("admin client 只被排程路由使用", () => {
    const users = files.filter((f) => readFileSync(f, "utf8").includes("@/lib/supabase/admin")).map((f) => relative(SRC, f));
    expect(users).toEqual([join("app", "api", "cron", "daily", "route.ts")]);
  });
});
