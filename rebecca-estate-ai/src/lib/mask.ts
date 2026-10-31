/** 個資遮罩：預設只顯示部分內容，業務按「顯示」才看到完整資料 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "*".repeat(digits.length);
  return `${digits.slice(0, 4)}-***-${digits.slice(-3)}`;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

export function maskText(text: string | null | undefined, keep = 1): string {
  if (!text) return "";
  return text.slice(0, keep) + "*".repeat(Math.max(2, Math.min(6, text.length - keep)));
}
