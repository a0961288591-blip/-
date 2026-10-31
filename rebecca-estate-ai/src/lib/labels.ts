/** 資料庫 enum 對應的繁體中文標籤（順序即畫面選項順序） */
export const PROPERTY_TYPE = {
  building_land: "建地",
  farmland: "農地",
  industrial_land: "工業地",
  partial_land: "持分土地",
  factory: "廠房",
  storefront: "店面",
  office: "商辦",
  residential: "住宅（大樓/華廈）",
  apartment: "公寓",
  townhouse: "透天",
  other: "其他",
} as const;

export const PROPERTY_STATUS = {
  draft: "開發中",
  active: "銷售中",
  negotiating: "議價中",
  under_contract: "已簽約",
  sold: "已成交",
  withdrawn: "已撤案",
  expired: "委託到期",
} as const;

export const MANDATE_TYPE = {
  exclusive: "專任委託",
  general: "一般委託",
  co_brokerage: "合作案",
  none: "未委託",
} as const;

export const ASSIGNMENT_ROLE = { lead: "主負責", co_developer: "共同開發", assistant: "助理" } as const;

export const FILE_KIND = {
  photo: "照片",
  cadastral_map: "地籍圖",
  land_transcript: "謄本",
  building_plan: "建築圖說",
  contract: "合約",
  other: "其他",
} as const;

export const FILE_SENSITIVITY = {
  public: "可公開",
  internal: "內部",
  restricted: "限閱（僅可看底價者）",
} as const;

export const VERIFICATION = {
  verified: "已核實",
  pending: "待確認",
  expired: "已過期",
  ai_concept: "AI 概念示意",
} as const;

export const CONTACT_TYPE = {
  seller: "屋主",
  buyer: "買方",
  developer: "建商",
  corporate: "企業法人",
  investor: "投資人",
  partner: "合作夥伴",
} as const;

export const CONTACT_GRADE = { S: "S", A: "A", B: "B", C: "C" } as const;

export const CONTACT_STAGE = {
  research: "研究名單",
  not_contacted: "未聯繫",
  contacted: "已聯繫",
  requirement_confirmed: "需求已確認",
  recommended: "已推薦",
  viewed: "已帶看",
  negotiating: "議價中",
  closed_won: "成交",
} as const;

export const CONSENT = { unknown: "未確認", granted: "同意行銷", refused: "拒絕行銷" } as const;

export const REQUIREMENT_STATUS = { active: "進行中", paused: "暫停", closed: "結案" } as const;

export const ACTIVITY_KIND = {
  call: "電話",
  line: "LINE",
  email: "Email",
  meeting: "面談",
  showing: "帶看",
  negotiation: "議價",
  note: "備註",
} as const;

export const ACTIVITY_STATUS = {
  completed: "已完成",
  no_answer: "未接通",
  planned: "已預約",
  cancelled: "已取消",
} as const;

export const TASK_KIND = {
  todo: "待辦",
  call: "電話",
  showing: "帶看",
  meeting: "面談",
  follow_up: "追蹤",
  document: "文件",
  developer_outreach: "建商開發",
  other: "其他",
} as const;

/** 重要欄位：需記錄來源、查證日期與可信度 */
export const VERIFIABLE_FIELDS = {
  list_price: "開價",
  land_area_ping: "地坪",
  building_area_ping: "建坪",
  zoning: "使用分區",
  building_coverage_pct: "建蔽率",
  floor_area_ratio_pct: "容積率",
  road_width_m: "臨路寬",
  frontage_m: "面寬",
  depth_m: "深度",
  height_limit_note: "航空限高",
  special_restrictions: "特殊限制",
} as const;

export function labelOf<T extends Record<string, string>>(map: T, key: string | null | undefined, fallback = "待確認"): string {
  if (!key) return fallback;
  return (map as Record<string, string>)[key] ?? key;
}

export function optionsOf<T extends Record<string, string>>(map: T) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}
