import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundle } from "../../scripts/bundle-migrations.mjs";

describe("supabase/deploy/all-migrations.sql", () => {
  it("與 migrations 目錄內容一致（修改 migration 後請執行 node scripts/bundle-migrations.mjs）", () => {
    const committed = readFileSync(join(__dirname, "..", "..", "supabase", "deploy", "all-migrations.sql"), "utf8");
    expect(committed).toBe(bundle());
  });
});
