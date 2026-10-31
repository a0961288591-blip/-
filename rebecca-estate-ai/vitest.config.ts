import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    environment: "node",
    // 資料庫測試共用同一個 PostgreSQL，避免並行建立過多連線
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
