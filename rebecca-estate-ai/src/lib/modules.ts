import {
  Building2,
  CheckSquare,
  FileBarChart,
  Handshake,
  Home,
  Landmark,
  Megaphone,
  Search,
  Settings,
  Shuffle,
  Users,
  type LucideIcon,
} from "lucide-react";

/** 主要導航與各模組開放階段。phase > CURRENT_PHASE 的模組只顯示規劃說明。 */
export const CURRENT_PHASE = 2;

export interface ModuleDef {
  key: string;
  label: string;
  icon: LucideIcon;
  phase: number;
  summary: string;
  mobile?: boolean; // 手機底部導航
}

export const MODULES: ModuleDef[] = [
  { key: "dashboard", label: "首頁", icon: Home, phase: 1, summary: "今日 TOP 3、逾期追蹤、委託到期、成交管線", mobile: true },
  { key: "properties", label: "房源", icon: Building2, phase: 2, summary: "住宅、店面、建地、農地、工業地等案件資料庫，含多筆地號、附件與查證狀態", mobile: true },
  { key: "contacts", label: "客戶", icon: Users, phase: 2, summary: "屋主、買方、建商、法人、投資人；聯繫紀錄與 S/A/B/C 分級", mobile: true },
  { key: "requirements", label: "買方需求", icon: Search, phase: 2, summary: "一位買方多組需求：地區、預算、面積、分區、容積率與排除條件" },
  { key: "matches", label: "配案", icon: Shuffle, phase: 3, summary: "規則式配對，顯示 0–100 匹配度、符合／不符合／未知原因（非成交機率）" },
  { key: "developers", label: "建商", icon: Landmark, phase: 3, summary: "建商與大型買方池：購地偏好、公開購地紀錄與實際需求分開管理" },
  { key: "marketing", label: "行銷", icon: Megaphone, phase: 4, summary: "依已核實資料生成各平台文案、DM、PDF；人工審核後半自動刊登" },
  { key: "deals", label: "成交", icon: Handshake, phase: 5, summary: "詢問→帶看→出價→斡旋→簽約→交屋；預估、已簽約、實收分開計算" },
  { key: "tasks", label: "任務", icon: CheckSquare, phase: 2, summary: "每日待辦、延續與逾期標記、上午 TOP 3、晚間回顧、週五結算", mobile: true },
  { key: "reports", label: "報表", icon: FileBarChart, phase: 5, summary: "成交漏斗、屋主週報、業務活動量" },
  { key: "settings", label: "設定", icon: Settings, phase: 1, summary: "成員與權限、方案與額度" },
];

export function moduleByKey(key: string) {
  return MODULES.find((m) => m.key === key);
}
