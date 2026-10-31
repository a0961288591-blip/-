import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { z } from "zod";
import { echoValues, fieldErrorsOf, type FormState } from "@/lib/validation";

/** 資料庫錯誤 → 使用者看得懂的訊息（不洩漏內部細節） */
export function dbErrorState(error: Pick<PostgrestError, "code" | "message"> | null, fd?: FormData): FormState {
  const values = fd ? echoValues(fd) : undefined;
  if (!error) return { error: "操作失敗，請稍後再試", values };
  switch (error.code) {
    case "42501":
      // RLS 或 RPC 權限拒絕
      return { error: error.message && /[一-鿿]/.test(error.message) ? error.message : "你沒有權限執行此操作", values };
    case "P0001":
      return { error: error.message, values };
    case "23505":
      return { error: "資料重複，請檢查是否已存在相同資料", values };
    case "23503":
      return { error: "關聯的資料不存在，或不屬於此工作空間", values };
    case "23514":
      return { error: "資料不符合規則，請檢查數值範圍與日期", values };
    case "22P02":
    case "22007":
    case "22008":
      return { error: "資料格式不正確", values };
    default:
      console.error("[db]", error.code, error.message);
      return { error: "操作失敗，請稍後再試", values };
  }
}

export function invalid(error: z.ZodError, fd: FormData): FormState {
  return { fieldErrors: fieldErrorsOf(error), values: echoValues(fd), error: "請修正標示的欄位" };
}
