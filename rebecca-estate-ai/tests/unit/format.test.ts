import { describe, expect, it } from "vitest";
import { UNKNOWN, addDays, calendarDaysBetween, formatPing, formatTwd, sqmToPing, taipeiDate, taipeiDayRange } from "@/lib/format";

describe("金額與面積格式", () => {
  it("新台幣以萬為單位", () => {
    expect(formatTwd(38_000_000)).toBe("3,800 萬");
    expect(formatTwd("36800000")).toBe("3,680 萬");
    expect(formatTwd(12_345_678)).toBe("1,234.57 萬");
    expect(formatTwd(9_999)).toBe("9,999 元");
  });

  it("未知值顯示待確認，不補數字", () => {
    expect(formatTwd(null)).toBe(UNKNOWN);
    expect(formatTwd(undefined)).toBe(UNKNOWN);
    expect(formatTwd("")).toBe(UNKNOWN);
    expect(formatTwd("abc")).toBe(UNKNOWN);
    expect(formatPing(null)).toBe(UNKNOWN);
  });

  it("坪數與平方公尺換算", () => {
    expect(formatPing(120.5)).toBe("120.5 坪");
    expect(sqmToPing(100)).toBeCloseTo(30.25, 3);
  });
});

describe("台北時區日期", () => {
  it("UTC 16:00 之後已是台北隔天", () => {
    expect(taipeiDate(new Date("2026-10-31T15:59:00Z"))).toBe("2026-10-31");
    expect(taipeiDate(new Date("2026-10-31T16:00:00Z"))).toBe("2026-11-01");
  });

  it("台北一天的 UTC 區間", () => {
    expect(taipeiDayRange("2026-11-02")).toEqual({
      start: "2026-11-01T16:00:00.000Z",
      end: "2026-11-02T16:00:00.000Z",
    });
  });

  it("日曆日差與加減", () => {
    expect(calendarDaysBetween("2026-10-29", "2026-11-01")).toBe(3);
    expect(addDays("2026-10-31", 30)).toBe("2026-11-30");
  });
});
