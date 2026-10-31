-- =====================================================================
-- REBECCA ESTATE AI · Migration 02 · 業務資料表
-- 每張業務表皆有 tenant_id；所有關聯使用 (tenant_id, id) 複合外鍵，
-- 讓資料庫本身拒絕跨租戶關聯。
-- =====================================================================

-- ---------- Enums ----------
create type public.property_type as enum (
  'residential',     -- 住宅（大樓/華廈）
  'apartment',       -- 公寓
  'townhouse',       -- 透天
  'storefront',      -- 店面
  'office',          -- 商辦
  'building_land',   -- 建地
  'farmland',        -- 農地
  'industrial_land', -- 工業地
  'factory',         -- 廠房
  'partial_land',    -- 持分土地
  'other'
);
create type public.property_status as enum ('draft', 'active', 'negotiating', 'under_contract', 'sold', 'withdrawn', 'expired');
create type public.mandate_type as enum ('exclusive', 'general', 'co_brokerage', 'none');
create type public.assignment_role as enum ('lead', 'co_developer', 'assistant');
create type public.file_kind as enum ('photo', 'cadastral_map', 'land_transcript', 'building_plan', 'contract', 'other');
create type public.file_sensitivity as enum ('public', 'internal', 'restricted');
-- 資料可信度狀態：已核實 / 待確認 / 已過期 / AI 概念示意
create type public.verification_status as enum ('verified', 'pending', 'expired', 'ai_concept');

create type public.contact_type as enum ('seller', 'buyer', 'developer', 'corporate', 'investor', 'partner');
create type public.contact_grade as enum ('S', 'A', 'B', 'C');
-- 依序：研究名單 < 未聯繫 < 已聯繫 < 需求已確認 < 已推薦 < 已帶看 < 議價中 < 成交
create type public.contact_stage as enum (
  'research', 'not_contacted', 'contacted', 'requirement_confirmed', 'recommended', 'viewed', 'negotiating', 'closed_won'
);
create type public.consent_status as enum ('unknown', 'granted', 'refused');
create type public.property_contact_relation as enum ('owner', 'co_owner', 'representative', 'mandator');
create type public.requirement_status as enum ('active', 'paused', 'closed');
create type public.activity_kind as enum ('call', 'line', 'email', 'meeting', 'showing', 'negotiation', 'note');
create type public.activity_status as enum ('planned', 'completed', 'no_answer', 'cancelled');

create type public.match_status as enum ('candidate', 'confirmed', 'recommended', 'dismissed');
create type public.report_status as enum ('draft', 'approved', 'sent');
create type public.listing_platform as enum ('facebook', 'fb_marketplace', '591', 'threads', 'line', 'other');
create type public.listing_status as enum ('draft', 'published', 'paused', 'removed');
create type public.deal_stage as enum (
  'inquiry', 'recommended', 'scheduled', 'viewing', 'offer', 'negotiating', 'earnest', 'signed', 'handover', 'closed_won', 'closed_lost'
);
create type public.offer_type as enum ('verbal', 'written', 'earnest_money', 'purchase_offer');
create type public.offer_status as enum ('pending', 'countered', 'accepted', 'rejected', 'withdrawn');
create type public.task_kind as enum ('todo', 'call', 'showing', 'meeting', 'follow_up', 'document', 'developer_outreach', 'other');
create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done', 'cancelled');

-- =====================================================================
-- properties 房源
-- =====================================================================
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 40),        -- 案件編號
  title text not null check (char_length(btrim(title)) between 1 and 120),
  property_type public.property_type not null,
  status public.property_status not null default 'draft',
  city text,
  district text,
  address text,
  list_price bigint check (list_price >= 0),                              -- 開價（新台幣元）
  land_area_ping numeric(12, 3) check (land_area_ping >= 0),              -- 地坪
  building_area_ping numeric(12, 3) check (building_area_ping >= 0),      -- 建坪
  layout text,
  zoning text,                                                             -- 土地使用分區
  building_coverage_pct numeric(5, 2) check (building_coverage_pct between 0 and 100),  -- 建蔽率
  floor_area_ratio_pct numeric(7, 2) check (floor_area_ratio_pct between 0 and 2000),   -- 容積率
  road_width_m numeric(6, 2) check (road_width_m >= 0),                   -- 臨路寬
  frontage_m numeric(8, 2) check (frontage_m >= 0),                       -- 面寬
  depth_m numeric(8, 2) check (depth_m >= 0),                             -- 深度
  height_limit_note text,                                                  -- 航空限高
  special_restrictions text,
  mandate_type public.mandate_type,
  mandate_start_date date,
  mandate_end_date date,
  owner_agent_id uuid,                                                     -- 負責人
  public_description text,                                                 -- 對外公開說明
  internal_notes text,                                                     -- 內部備註（非機敏）
  -- 欄位層級來源與可信度：{ "<欄位>": { status, source, verified_at, confidence, note } }
  field_verifications jsonb not null default '{}'::jsonb check (jsonb_typeof(field_verifications) = 'object'),
  last_seller_report_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, code),
  check (mandate_end_date is null or mandate_start_date is null or mandate_end_date >= mandate_start_date),
  foreign key (tenant_id, owner_agent_id) references public.tenant_members (tenant_id, user_id),
  foreign key (tenant_id, created_by) references public.tenant_members (tenant_id, user_id)
);
create index properties_tenant_status_idx on public.properties (tenant_id, status) where deleted_at is null;
create index properties_tenant_owner_idx on public.properties (tenant_id, owner_agent_id) where deleted_at is null;
create index properties_tenant_district_idx on public.properties (tenant_id, city, district) where deleted_at is null;
create index properties_mandate_end_idx on public.properties (tenant_id, mandate_end_date) where deleted_at is null and archived_at is null;

-- 機敏：內部底價與佣金條件，獨立表 + 獨立 RLS
create table public.property_private (
  property_id uuid primary key,
  tenant_id uuid not null,
  floor_price bigint check (floor_price >= 0),
  commission_terms text,
  seller_bottom_line_notes text,
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id) on delete cascade
);
create index property_private_tenant_idx on public.property_private (tenant_id);

-- 地段地號（一案多筆）
create table public.property_parcels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  county text,
  district text,
  section text,          -- 段
  subsection text,       -- 小段
  parcel_no text not null check (char_length(parcel_no) between 1 and 30), -- 地號
  area_sqm numeric(14, 2) check (area_sqm >= 0),
  share_numerator bigint check (share_numerator > 0),     -- 持分分子
  share_denominator bigint check (share_denominator > 0), -- 持分分母
  zoning text,
  verification public.verification_status not null default 'pending',
  source text,
  verified_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (share_numerator is null or share_denominator is null or share_numerator <= share_denominator),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id) on delete cascade
);
create index property_parcels_property_idx on public.property_parcels (tenant_id, property_id);
create unique index property_parcels_unique_no on public.property_parcels
  (tenant_id, property_id, coalesce(county, ''), coalesce(district, ''), coalesce(section, ''), coalesce(subsection, ''), parcel_no);

-- 附件：照片、地籍圖、謄本、圖說…（實體檔放 Storage，私有）
create table public.property_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  kind public.file_kind not null,
  sensitivity public.file_sensitivity not null default 'internal',
  storage_path text not null unique,  -- {tenant_id}/{property_id}/{file_id}/{檔名}
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  verification public.verification_status not null default 'pending',
  source text,
  verified_at date,
  expires_at date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id),
  check (storage_path like tenant_id::text || '/' || property_id::text || '/%'),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id) on delete cascade,
  foreign key (tenant_id, created_by) references public.tenant_members (tenant_id, user_id)
);
create index property_files_property_idx on public.property_files (tenant_id, property_id) where deleted_at is null;

-- 開價異動歷史（由觸發器寫入）
create table public.property_price_history (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  property_id uuid not null,
  old_price bigint,
  new_price bigint,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id) on delete cascade
);
create index property_price_history_idx on public.property_price_history (tenant_id, property_id, changed_at desc);

-- 案件負責與共同開發
create table public.property_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  user_id uuid not null,
  role public.assignment_role not null default 'co_developer',
  share_pct numeric(5, 2) check (share_pct between 0 and 100),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (property_id, user_id),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id) on delete cascade,
  foreign key (tenant_id, user_id) references public.tenant_members (tenant_id, user_id)
);
create index property_assignments_user_idx on public.property_assignments (tenant_id, user_id);

-- =====================================================================
-- contacts 客戶
-- =====================================================================
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  contact_types public.contact_type[] not null check (cardinality(contact_types) > 0),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  company text,
  job_title text,
  source text,                       -- 來源（轉介、網路、開發、公開資料…）
  is_public_lead boolean not null default false,   -- 公開線索（網路查得）
  public_source_url text,
  owner_user_id uuid,                -- 負責業務
  grade public.contact_grade,
  stage public.contact_stage not null default 'not_contacted',
  marketing_consent public.consent_status not null default 'unknown',
  consent_recorded_at timestamptz,
  do_not_contact boolean not null default false,   -- 拒絕行銷/勿擾
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, owner_user_id) references public.tenant_members (tenant_id, user_id),
  foreign key (tenant_id, created_by) references public.tenant_members (tenant_id, user_id)
);
create index contacts_tenant_owner_idx on public.contacts (tenant_id, owner_user_id) where deleted_at is null;
create index contacts_follow_up_idx on public.contacts (tenant_id, next_follow_up_at) where deleted_at is null and archived_at is null;
create index contacts_types_idx on public.contacts using gin (contact_types);

-- 機敏：聯絡資訊，獨立表 + 獨立 RLS
create table public.contact_pii (
  contact_id uuid primary key,
  tenant_id uuid not null,
  phone text check (char_length(phone) <= 30),
  phone_alt text check (char_length(phone_alt) <= 30),
  email text check (char_length(email) <= 254),
  line_id text check (char_length(line_id) <= 60),
  address text,
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade
);
create index contact_pii_tenant_idx on public.contact_pii (tenant_id);
create index contact_pii_phone_idx on public.contact_pii (tenant_id, phone) where phone is not null;

-- 案件與客戶多對多（屋主、共有人、代理人、委託人）
create table public.property_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  contact_id uuid not null,
  relation public.property_contact_relation not null default 'owner',
  note text,
  created_at timestamptz not null default now(),
  unique (property_id, contact_id, relation),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id) on delete cascade,
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade
);
create index property_contacts_contact_idx on public.property_contacts (tenant_id, contact_id);

-- 買方需求（一位買方多組）
create table public.buyer_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  status public.requirement_status not null default 'active',
  property_types public.property_type[] not null default '{}',
  cities text[] not null default '{}',
  districts text[] not null default '{}',
  budget_min bigint check (budget_min >= 0),
  budget_max bigint check (budget_max >= 0),
  land_area_min_ping numeric(12, 3),
  land_area_max_ping numeric(12, 3),
  building_area_min_ping numeric(12, 3),
  building_area_max_ping numeric(12, 3),
  zoning_preferences text[] not null default '{}',
  far_min_pct numeric(7, 2),
  road_width_min_m numeric(6, 2),
  purpose text,
  must_haves text,
  exclusions text[] not null default '{}',   -- 明確排除條件
  notes text,
  confirmed_at timestamptz,                  -- 需求經客戶確認時間
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id),
  check (budget_min is null or budget_max is null or budget_min <= budget_max),
  check (land_area_min_ping is null or land_area_max_ping is null or land_area_min_ping <= land_area_max_ping),
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, created_by) references public.tenant_members (tenant_id, user_id)
);
create index buyer_requirements_contact_idx on public.buyer_requirements (tenant_id, contact_id) where deleted_at is null;
create index buyer_requirements_active_idx on public.buyer_requirements (tenant_id, status) where deleted_at is null;

-- =====================================================================
-- deals / offers 成交與議價
-- =====================================================================
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  property_id uuid not null,
  buyer_contact_id uuid not null,
  requirement_id uuid,
  stage public.deal_stage not null default 'inquiry',
  owner_user_id uuid,
  expected_fee bigint check (expected_fee >= 0),       -- 預估服務費（不列入業績）
  contracted_amount bigint check (contracted_amount >= 0),  -- 已簽約成交金額
  contracted_fee bigint check (contracted_fee >= 0),   -- 已簽約服務費
  received_fee bigint not null default 0 check (received_fee >= 0), -- 實際收款
  lost_reason text,
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id),
  check (stage <> 'closed_lost' or lost_reason is not null),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id),
  foreign key (tenant_id, buyer_contact_id) references public.contacts (tenant_id, id),
  foreign key (tenant_id, requirement_id) references public.buyer_requirements (tenant_id, id),
  foreign key (tenant_id, owner_user_id) references public.tenant_members (tenant_id, user_id),
  foreign key (tenant_id, created_by) references public.tenant_members (tenant_id, user_id)
);
create index deals_tenant_stage_idx on public.deals (tenant_id, stage) where deleted_at is null;
create index deals_property_idx on public.deals (tenant_id, property_id);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  deal_id uuid not null,
  offer_type public.offer_type not null default 'verbal',
  amount bigint not null check (amount >= 0),
  terms text,
  status public.offer_status not null default 'pending',
  seller_response text,
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, deal_id) references public.deals (tenant_id, id) on delete cascade,
  foreign key (tenant_id, created_by) references public.tenant_members (tenant_id, user_id)
);
create index offers_deal_idx on public.offers (tenant_id, deal_id, offered_at desc);

-- 聯繫紀錄（電話、LINE、Email、面談、帶看、議價）
create table public.contact_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id uuid not null,
  property_id uuid,
  deal_id uuid,
  kind public.activity_kind not null,
  status public.activity_status not null,
  reached boolean not null default false,          -- 是否實際接通/見面
  occurred_at timestamptz not null,
  summary text not null check (char_length(btrim(summary)) between 1 and 2000),
  next_step text,
  next_follow_up_at timestamptz,
  owner_user_id uuid not null,                     -- 負責人
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id),
  check (reached = false or status = 'completed'),
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id),
  foreign key (tenant_id, deal_id) references public.deals (tenant_id, id),
  foreign key (tenant_id, owner_user_id) references public.tenant_members (tenant_id, user_id),
  foreign key (tenant_id, created_by) references public.tenant_members (tenant_id, user_id)
);
create index contact_activities_contact_idx on public.contact_activities (tenant_id, contact_id, occurred_at desc) where deleted_at is null;

-- =====================================================================
-- matches 配對 / seller_reports 屋主回報 / listing_records 刊登
-- =====================================================================
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  requirement_id uuid not null,
  score smallint not null check (score between 0 and 100),   -- 需求匹配度，非成交機率
  reasons jsonb not null default '[]'::jsonb,
  mismatches jsonb not null default '[]'::jsonb,
  unknowns jsonb not null default '[]'::jsonb,
  excluded boolean not null default false,
  rule_version text not null,
  status public.match_status not null default 'candidate',
  computed_at timestamptz not null default now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (property_id, requirement_id),
  check (status = 'candidate' or status = 'dismissed' or confirmed_by is not null),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id) on delete cascade,
  foreign key (tenant_id, requirement_id) references public.buyer_requirements (tenant_id, id) on delete cascade,
  foreign key (tenant_id, confirmed_by) references public.tenant_members (tenant_id, user_id)
);
create index matches_tenant_status_idx on public.matches (tenant_id, status, score desc);

create table public.seller_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  period_start date not null,
  period_end date not null,
  stats jsonb not null default '{}'::jsonb,   -- 由真實紀錄統計
  body text,
  status public.report_status not null default 'draft',
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (period_end >= period_start),
  check (status = 'draft' or approved_by is not null),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id) on delete cascade,
  foreign key (tenant_id, approved_by) references public.tenant_members (tenant_id, user_id),
  foreign key (tenant_id, created_by) references public.tenant_members (tenant_id, user_id)
);
create index seller_reports_property_idx on public.seller_reports (tenant_id, property_id, period_end desc);

create table public.listing_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  platform public.listing_platform not null,
  url text check (url is null or url ~ '^https?://'),
  status public.listing_status not null default 'draft',
  published_at timestamptz,
  removed_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id) on delete cascade,
  foreign key (tenant_id, created_by) references public.tenant_members (tenant_id, user_id)
);
create index listing_records_property_idx on public.listing_records (tenant_id, property_id);

-- =====================================================================
-- tasks 待辦 / notifications 站內通知
-- =====================================================================
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text,
  kind public.task_kind not null default 'todo',
  priority smallint not null default 2 check (priority between 1 and 3),  -- 1 高 / 2 中 / 3 低
  status public.task_status not null default 'todo',
  original_date date not null default public.taipei_today(),   -- 原建立日期（延續時保留）
  scheduled_date date not null default public.taipei_today(),  -- 排定處理日
  due_at timestamptz,
  carried_over_count integer not null default 0 check (carried_over_count >= 0),
  property_id uuid,
  contact_id uuid,
  deal_id uuid,
  assignee_id uuid not null,
  next_step text,
  blocker text,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id),
  check (status <> 'done' or completed_at is not null),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id),
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id),
  foreign key (tenant_id, deal_id) references public.deals (tenant_id, id),
  foreign key (tenant_id, assignee_id) references public.tenant_members (tenant_id, user_id),
  foreign key (tenant_id, created_by) references public.tenant_members (tenant_id, user_id)
);
create index tasks_assignee_open_idx on public.tasks (tenant_id, assignee_id, scheduled_date, priority)
  where deleted_at is null and status in ('todo', 'in_progress', 'blocked');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  kind text not null,
  title text not null,
  body text,
  link text check (link is null or link like '/%'),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, dedupe_key),
  foreign key (tenant_id, user_id) references public.tenant_members (tenant_id, user_id) on delete cascade
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- =====================================================================
-- 物件權限輔助函式
-- =====================================================================
create or replace function public.is_property_assignee(p_tenant uuid, p_property uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.properties p
    where p.tenant_id = p_tenant and p.id = p_property and p.owner_agent_id = auth.uid()
  ) or exists (
    select 1 from public.property_assignments a
    where a.tenant_id = p_tenant and a.property_id = p_property and a.user_id = auth.uid()
      and a.role in ('lead', 'co_developer')
  )
$$;

create or replace function public.can_edit_property(p_tenant uuid, p_property uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_role(p_tenant, 'manager')
      or (public.has_tenant_role(p_tenant, 'agent') and public.is_property_assignee(p_tenant, p_property))
$$;

-- 底價：經理以上、獲授權成員，或該案負責/共同開發業務
create or replace function public.can_view_property_private(p_tenant uuid, p_property uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_permission(p_tenant, 'floor_price')
      or (public.has_tenant_role(p_tenant, 'agent') and public.is_property_assignee(p_tenant, p_property))
$$;

create or replace function public.can_edit_contact(p_tenant uuid, p_contact uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_role(p_tenant, 'manager')
      or (public.has_tenant_role(p_tenant, 'agent') and exists (
            select 1 from public.contacts c
            where c.tenant_id = p_tenant and c.id = p_contact and c.owner_user_id = auth.uid()))
$$;

-- 聯絡資訊：經理以上、獲授權成員，或該客戶負責業務
create or replace function public.can_view_contact_pii(p_tenant uuid, p_contact uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_permission(p_tenant, 'contact_pii')
      or (public.has_tenant_role(p_tenant, 'agent') and exists (
            select 1 from public.contacts c
            where c.tenant_id = p_tenant and c.id = p_contact and c.owner_user_id = auth.uid()))
$$;

create or replace function public.can_edit_deal(p_tenant uuid, p_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_role(p_tenant, 'manager')
      or (public.has_tenant_role(p_tenant, 'agent') and exists (
            select 1 from public.deals d
            where d.tenant_id = p_tenant and d.id = p_deal and d.owner_user_id = auth.uid()))
$$;

-- =====================================================================
-- 業務觸發器
-- =====================================================================
-- 案件編號未填時自動產生：P + 台北日期 + 4 碼
create or replace function public.tg_properties_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := 'P' || to_char(now() at time zone 'Asia/Taipei', 'YYMMDD') || '-' || upper(substr(replace(new.id::text, '-', ''), 1, 4));
  end if;
  return new;
end
$$;

create or replace function public.tg_properties_price_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.list_price is not null then
    insert into public.property_price_history (tenant_id, property_id, old_price, new_price, changed_by)
    values (new.tenant_id, new.id, null, new.list_price, auth.uid());
  elsif tg_op = 'UPDATE' and new.list_price is distinct from old.list_price then
    insert into public.property_price_history (tenant_id, property_id, old_price, new_price, changed_by)
    values (new.tenant_id, new.id, old.list_price, new.list_price, auth.uid());
  end if;
  return new;
end
$$;

-- 階段守門：沒有實際接通的聯繫紀錄，不得標記為「已聯繫」或之後階段
create or replace function public.tg_contacts_stage_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 公開線索（網路搜尋到的公司）一律從研究名單開始
  if tg_op = 'INSERT' and new.is_public_lead then
    new.stage := 'research';
  end if;
  if new.stage >= 'contacted' and (tg_op = 'INSERT' or old.stage < 'contacted') then
    if not exists (
      select 1 from public.contact_activities a
      where a.tenant_id = new.tenant_id and a.contact_id = new.id
        and a.status = 'completed' and a.reached and a.deleted_at is null
    ) then
      raise exception '需先有一筆實際接通的聯繫紀錄，才能標記為「已聯繫」或之後的階段' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;

-- 聯繫紀錄寫入後：更新最近接洽、下次追蹤；首次接通自動推進到「已聯繫」
create or replace function public.tg_activities_sync_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and new.deleted_at is null then
    update public.contacts c
       set last_contacted_at = greatest(coalesce(c.last_contacted_at, new.occurred_at), new.occurred_at),
           next_follow_up_at = coalesce(new.next_follow_up_at, c.next_follow_up_at),
           stage = case when new.reached and c.stage < 'contacted' then 'contacted'::public.contact_stage else c.stage end
     where c.tenant_id = new.tenant_id and c.id = new.contact_id;
  end if;
  return new;
end
$$;

-- 任務：原建立日期不可改；完成時寫入完成時間
create or replace function public.tg_tasks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.original_date := old.original_date;
  end if;
  if new.status = 'done' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end
$$;

-- 成交：階段變更時間
create or replace function public.tg_deals_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    if new.stage in ('closed_won', 'closed_lost') then
      new.closed_at := coalesce(new.closed_at, now());
    else
      new.closed_at := null;
    end if;
  end if;
  return new;
end
$$;

-- ---------- 套用觸發器 ----------
do $$
declare
  t text;
begin
  -- updated_at
  foreach t in array array['properties','property_private','property_parcels','property_files','contacts','contact_pii',
                           'buyer_requirements','contact_activities','matches','seller_reports','listing_records',
                           'deals','offers','tasks'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.tg_set_updated_at()', t || '_updated_at', t);
  end loop;
  -- tenant_id 不可變
  foreach t in array array['properties','property_private','property_parcels','property_files','property_price_history',
                           'property_assignments','contacts','contact_pii','property_contacts','buyer_requirements',
                           'contact_activities','matches','seller_reports','listing_records','deals','offers','tasks','notifications'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.tg_guard_tenant_id()', t || '_guard_tenant', t);
  end loop;
  -- created_by 由伺服器決定
  foreach t in array array['properties','property_files','property_assignments','contacts','buyer_requirements',
                           'contact_activities','seller_reports','listing_records','deals','offers','tasks'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.tg_guard_created_by()', t || '_guard_created_by', t);
  end loop;
  -- 稽核
  foreach t in array array['properties','property_private','property_parcels','property_files','property_assignments',
                           'contacts','property_contacts','buyer_requirements','matches','seller_reports',
                           'listing_records','deals','offers'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.tg_audit()', t || '_audit', t);
  end loop;
end
$$;

-- 個資稽核只記錄欄位名稱
create trigger contact_pii_audit after insert or update or delete on public.contact_pii
  for each row execute function public.tg_audit('redact');

create trigger properties_defaults before insert on public.properties
  for each row execute function public.tg_properties_defaults();
create trigger properties_entitlement before insert on public.properties
  for each row execute function public.tg_enforce_entitlement('properties');
create trigger properties_price_history after insert or update of list_price on public.properties
  for each row execute function public.tg_properties_price_history();

create trigger contacts_entitlement before insert on public.contacts
  for each row execute function public.tg_enforce_entitlement('contacts');
create trigger contacts_stage_guard before insert or update of stage, is_public_lead on public.contacts
  for each row execute function public.tg_contacts_stage_guard();

create trigger contact_activities_sync after insert or update on public.contact_activities
  for each row execute function public.tg_activities_sync_contact();

create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.tg_tasks_guard();

create trigger deals_stage before insert or update on public.deals
  for each row execute function public.tg_deals_stage();

-- =====================================================================
-- 檢視表（security_invoker：沿用呼叫者 RLS）
-- =====================================================================
create view public.v_tasks with (security_invoker = true) as
select
  t.*,
  public.taipei_today() - t.original_date as age_days,
  -- 超過兩個日曆日仍未完成
  (t.status in ('todo', 'in_progress', 'blocked') and public.taipei_today() - t.original_date > 2) as is_stale,
  (t.status in ('todo', 'in_progress', 'blocked') and t.due_at is not null and t.due_at < now()) as is_overdue
from public.tasks t
where t.deleted_at is null;

-- =====================================================================
-- 排程：未完成任務延續到下一工作日（保留 original_date）
-- 由 pg_cron 或伺服器排程以 service_role 執行
-- =====================================================================
create or replace function public.carry_over_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target date := public.next_workday(public.taipei_today());
  v_count integer;
begin
  update public.tasks
     set scheduled_date = v_target,
         carried_over_count = carried_over_count + 1
   where deleted_at is null
     and status in ('todo', 'in_progress', 'blocked')
     and scheduled_date < public.taipei_today();
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
