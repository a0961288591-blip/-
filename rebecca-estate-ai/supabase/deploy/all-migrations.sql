-- =====================================================================
-- REBECCA ESTATE AI · 全部資料庫結構（自動產生，請勿手動修改）
-- 使用方式：Supabase 後台 → SQL Editor → New query → 貼上全部內容 → Run
-- 只能在「全新」的 Supabase 專案執行一次；之後的更新請用 supabase db push
-- 內含 6 個 migration：20261031000100_tenancy.sql, 20261031000200_business.sql, 20261031000300_rls_grants.sql, 20261031000400_storage.sql, 20261101000500_phase2.sql, 20261101000600_schedules.sql
-- =====================================================================

-- ▼▼▼ 20261031000100_tenancy.sql ▼▼▼
-- =====================================================================
-- REBECCA ESTATE AI · Migration 01 · 多租戶核心
-- shared database + shared schema + tenant_id
-- 租戶、成員、角色、方案、訂閱、額度、用量、稽核
-- =====================================================================

-- ---------- Enums ----------
-- 角色依權限由低到高排序，可直接以 >= 比較
create type public.member_role as enum ('viewer', 'agent', 'manager', 'owner');
create type public.member_status as enum ('invited', 'active', 'suspended');
create type public.tenant_kind as enum ('company', 'team', 'solo');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');

-- ---------- 共用：台北時區日期 ----------
create or replace function public.taipei_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Taipei')::date
$$;

create or replace function public.next_workday(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  -- 週六→下週一、週日→下週一，其餘不變
  select case extract(isodow from p_date)::int
    when 6 then p_date + 2
    when 7 then p_date + 1
    else p_date
  end
$$;

-- ---------- tenants ----------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  kind public.tenant_kind not null default 'solo',
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.tenants is '租戶：房仲公司、團隊或個人工作室';

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  phone text check (char_length(phone) <= 30),
  avatar_url text,
  timezone text not null default 'Asia/Taipei',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- roles（參考表） ----------
create table public.roles (
  key public.member_role primary key,
  name_zh text not null,
  description text not null,
  default_permissions jsonb not null
);

insert into public.roles (key, name_zh, description, default_permissions) values
  ('owner',   '負責人', '工作空間擁有者，可管理成員、方案與全部資料',
     '{"floor_price":true,"contact_pii":true,"export":true,"files":true}'),
  ('manager', '經理',   '可管理全部案件與客戶、指派業務，不可調整負責人',
     '{"floor_price":true,"contact_pii":true,"export":true,"files":true}'),
  ('agent',   '業務',   '可新增案件與客戶；僅能編輯自己負責或被指派的資料',
     '{"floor_price":false,"contact_pii":false,"export":false,"files":false}'),
  ('viewer',  '檢視者', '唯讀，看不到底價與客戶聯絡資訊',
     '{"floor_price":false,"contact_pii":false,"export":false,"files":false}');

-- ---------- tenant_members ----------
create table public.tenant_members (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'agent' references public.roles (key),
  status public.member_status not null default 'active',
  -- 獨立敏感權限（owner / manager 一律視為 true）
  can_view_floor_price boolean not null default false,
  can_view_contact_pii boolean not null default false,
  can_export boolean not null default false,
  can_manage_files boolean not null default false,
  invited_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members (user_id) where status = 'active';

-- ---------- plans ----------
create table public.plans (
  id text primary key check (id ~ '^[a-z0-9_]{2,30}$'),
  name text not null,
  price_monthly_twd integer not null check (price_monthly_twd >= 0),
  -- null 代表不限
  max_seats integer check (max_seats > 0),
  max_properties integer check (max_properties >= 0),
  max_contacts integer check (max_contacts >= 0),
  ai_credits_monthly integer check (ai_credits_monthly >= 0),
  storage_mb integer check (storage_mb >= 0),
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_public boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

-- V1 測試方案（價格僅供展示，不執行真實扣款）
insert into public.plans (id, name, price_monthly_twd, max_seats, max_properties, max_contacts, ai_credits_monthly, storage_mb, features, is_public, sort_order) values
  ('trial', '免費試用 14 天', 0,    5,    50,   300,   50,   500,
     '{"matching":true,"marketing_ai":true,"pdf_export":false,"csv_export":false}', false, 0),
  ('solo',  'Solo 個人',      990,  1,    200,  2000,  300,  5000,
     '{"matching":true,"marketing_ai":true,"pdf_export":true,"csv_export":true}', true, 1),
  ('pro',   'Pro 專業',       2490, 3,    1000, 10000, 1500, 20000,
     '{"matching":true,"marketing_ai":true,"pdf_export":true,"csv_export":true,"developer_pool":true}', true, 2),
  ('team',  'Team 團隊',      6990, 15,   null, null,  6000, 100000,
     '{"matching":true,"marketing_ai":true,"pdf_export":true,"csv_export":true,"developer_pool":true,"team_reports":true}', true, 3);

-- ---------- subscriptions ----------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status public.subscription_status not null default 'trialing',
  -- 金流抽象：V1 僅 mock；未來 newebpay / ecpay / tappay 定期定額
  billing_provider text not null default 'mock'
    check (billing_provider in ('mock', 'newebpay', 'ecpay', 'tappay')),
  provider_ref text,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '14 days'),
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);

-- ---------- tenant_entitlements（由方案同步，前端不可寫） ----------
create table public.tenant_entitlements (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  source_plan_id text references public.plans (id),
  max_seats integer,
  max_properties integer,
  max_contacts integer,
  ai_credits_monthly integer,
  storage_mb integer,
  features jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- usage_events ----------
create table public.usage_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('ai_generation', 'export', 'import', 'storage_upload')),
  quantity integer not null default 1 check (quantity >= 0),
  model text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cost_usd numeric(12, 6) check (cost_usd >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index usage_events_tenant_kind_idx on public.usage_events (tenant_id, kind, created_at desc);

-- ---------- audit_logs ----------
-- tenant_id 不設外鍵：保留稽核紀錄，不因串聯刪除失敗
create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  actor_id uuid,
  action text not null check (action in ('insert', 'update', 'delete', 'rpc')),
  table_name text not null,
  record_id text,
  changed_fields text[],
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_time_idx on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_record_idx on public.audit_logs (tenant_id, table_name, record_id);

-- =====================================================================
-- 授權輔助函式（security definer，避免 RLS 遞迴；固定 search_path）
-- =====================================================================
create or replace function public.member_role_of(p_tenant uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.tenant_members m
  join public.tenants t on t.id = m.tenant_id and t.deleted_at is null
  where m.tenant_id = p_tenant
    and m.user_id = auth.uid()
    and m.status = 'active'
$$;

create or replace function public.is_tenant_member(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.member_role_of(p_tenant) is not null
$$;

create or replace function public.has_tenant_role(p_tenant uuid, p_min public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.member_role_of(p_tenant) >= p_min, false)
$$;

-- p_perm: floor_price | contact_pii | export | files
create or replace function public.has_tenant_permission(p_tenant uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'manager') then true
      when p_perm = 'floor_price' then m.can_view_floor_price
      when p_perm = 'contact_pii' then m.can_view_contact_pii
      when p_perm = 'export' then m.can_export
      when p_perm = 'files' then m.can_manage_files
      else false
    end
    from public.tenant_members m
    join public.tenants t on t.id = m.tenant_id and t.deleted_at is null
    where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.status = 'active'
  ), false)
$$;

-- =====================================================================
-- 共用觸發器
-- =====================================================================
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- 禁止變更資料所屬租戶
create or replace function public.tg_guard_tenant_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception '不允許變更資料所屬工作空間' using errcode = '42501';
  end if;
  return new;
end
$$;

-- created_by 由伺服器端決定，不信任請求內容
create or replace function public.tg_guard_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end
$$;

-- 通用稽核：tg_argv[0] = 'redact' 時只記錄欄位名稱不記錄值（個資）
create or replace function public.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_fields text[];
  v_tenant uuid;
  v_id text;
  v_redact boolean := coalesce(tg_argv[0], '') = 'redact';
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  if tg_table_name = 'tenants' then
    v_tenant := (v_row ->> 'id')::uuid;
  else
    v_tenant := (v_row ->> 'tenant_id')::uuid;
  end if;
  v_id := coalesce(v_row ->> 'id', v_row ->> 'property_id', v_row ->> 'contact_id', v_row ->> 'user_id');

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_fields
    from jsonb_each(v_new) as n(key, value)
    where n.value is distinct from (v_old -> n.key)
      and n.key <> 'updated_at';
    if v_fields is null then
      return new;
    end if;
    select jsonb_object_agg(k, v_old -> k), jsonb_object_agg(k, v_new -> k)
      into v_old, v_new
    from unnest(v_fields) as k;
  else
    select array_agg(k order by k) into v_fields from jsonb_object_keys(v_row) as k;
  end if;

  if v_redact then
    v_old := null;
    v_new := null;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, table_name, record_id, changed_fields, old_values, new_values)
  values (v_tenant, auth.uid(), lower(tg_op), tg_table_name, v_id, v_fields, v_old, v_new);

  return coalesce(new, old);
end
$$;

-- 方案上限：tg_argv[0] = properties | contacts | seats
create or replace function public.tg_enforce_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := tg_argv[0];
  v_limit integer;
  v_count integer;
  v_label text;
begin
  perform pg_advisory_xact_lock(hashtext(new.tenant_id::text || ':' || v_kind));

  select case v_kind
           when 'properties' then e.max_properties
           when 'contacts' then e.max_contacts
           when 'seats' then e.max_seats
         end
    into v_limit
  from public.tenant_entitlements e
  where e.tenant_id = new.tenant_id;

  if not found then
    raise exception '此工作空間尚未設定方案額度' using errcode = 'P0001';
  end if;
  if v_limit is null then
    return new;
  end if;

  if v_kind = 'properties' then
    v_label := '物件數';
    select count(*) into v_count from public.properties where tenant_id = new.tenant_id and deleted_at is null;
  elsif v_kind = 'contacts' then
    v_label := '聯絡人數';
    select count(*) into v_count from public.contacts where tenant_id = new.tenant_id and deleted_at is null;
  else
    v_label := '席次';
    select count(*) into v_count from public.tenant_members where tenant_id = new.tenant_id and status in ('active', 'invited');
  end if;

  if v_count >= v_limit then
    raise exception '已達方案上限（%：%），請升級方案', v_label, v_limit using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- ---------- triggers ----------
create trigger tenants_updated_at before update on public.tenants
  for each row execute function public.tg_set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger tenant_members_updated_at before update on public.tenant_members
  for each row execute function public.tg_set_updated_at();
create trigger tenant_members_guard_tenant before update on public.tenant_members
  for each row execute function public.tg_guard_tenant_id();
create trigger tenant_members_seats before insert on public.tenant_members
  for each row execute function public.tg_enforce_entitlement('seats');
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();

create trigger tenants_audit after insert or update or delete on public.tenants
  for each row execute function public.tg_audit();
create trigger tenant_members_audit after insert or update or delete on public.tenant_members
  for each row execute function public.tg_audit();
create trigger subscriptions_audit after insert or update or delete on public.subscriptions
  for each row execute function public.tg_audit();
create trigger tenant_entitlements_audit after insert or update or delete on public.tenant_entitlements
  for each row execute function public.tg_audit();

-- 新使用者自動建立 profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), 60))
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- RPC：方案同步（僅 service_role / 內部使用）
-- =====================================================================
create or replace function public.sync_entitlements(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_entitlements as e
    (tenant_id, source_plan_id, max_seats, max_properties, max_contacts, ai_credits_monthly, storage_mb, features, updated_at)
  select s.tenant_id, p.id, p.max_seats, p.max_properties, p.max_contacts, p.ai_credits_monthly, p.storage_mb, p.features, now()
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant
  on conflict (tenant_id) do update set
    source_plan_id = excluded.source_plan_id,
    max_seats = excluded.max_seats,
    max_properties = excluded.max_properties,
    max_contacts = excluded.max_contacts,
    ai_credits_monthly = excluded.ai_credits_monthly,
    storage_mb = excluded.storage_mb,
    features = excluded.features,
    updated_at = now();
end
$$;

-- 模擬計費：切換方案（僅 service_role；由伺服器端金流流程呼叫）
create or replace function public.admin_set_plan(p_tenant uuid, p_plan text, p_status public.subscription_status default 'active')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.plans where id = p_plan and is_active) then
    raise exception '方案不存在' using errcode = 'P0001';
  end if;
  update public.subscriptions
     set plan_id = p_plan,
         status = p_status,
         current_period_start = now(),
         current_period_end = now() + interval '1 month'
   where tenant_id = p_tenant;
  if not found then
    raise exception '找不到訂閱' using errcode = 'P0001';
  end if;
  perform public.sync_entitlements(p_tenant);
end
$$;

-- =====================================================================
-- RPC：建立工作空間（使用者呼叫）
-- 一律從 trial 方案開始；方案變更只能經伺服器端金流流程
-- =====================================================================
create or replace function public.create_tenant(p_name text, p_slug text, p_kind public.tenant_kind default 'solo')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
begin
  if v_uid is null then
    raise exception '需要登入' using errcode = '42501';
  end if;
  if (select count(*) from public.tenants where created_by = v_uid and deleted_at is null) >= 5 then
    raise exception '每位使用者最多建立 5 個工作空間' using errcode = 'P0001';
  end if;

  insert into public.tenants (name, slug, kind, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), p_kind, v_uid)
  returning id into v_tenant;

  insert into public.subscriptions (tenant_id, plan_id, status, billing_provider)
  values (v_tenant, 'trial', 'trialing', 'mock');

  perform public.sync_entitlements(v_tenant);

  insert into public.tenant_members
    (tenant_id, user_id, role, status, joined_at, can_view_floor_price, can_view_contact_pii, can_export, can_manage_files)
  values (v_tenant, v_uid, 'owner', 'active', now(), true, true, true, true);

  return v_tenant;
end
$$;

-- =====================================================================
-- RPC：調整成員權限（owner / manager）
-- =====================================================================
create or replace function public.update_tenant_member(
  p_tenant uuid,
  p_user uuid,
  p_role public.member_role,
  p_status public.member_status,
  p_can_view_floor_price boolean,
  p_can_view_contact_pii boolean,
  p_can_export boolean,
  p_can_manage_files boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.member_role := public.member_role_of(p_tenant);
  v_target public.member_role;
begin
  if v_actor is null or v_actor < 'manager' then
    raise exception '權限不足' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception '不可調整自己的權限' using errcode = '42501';
  end if;

  select role into v_target from public.tenant_members where tenant_id = p_tenant and user_id = p_user;
  if not found then
    raise exception '成員不存在' using errcode = 'P0001';
  end if;

  if v_actor = 'manager' and (v_target >= 'manager' or p_role >= 'manager') then
    raise exception '經理無法調整經理或負責人的權限' using errcode = '42501';
  end if;

  if v_target = 'owner' and (p_role <> 'owner' or p_status <> 'active') then
    if not exists (
      select 1 from public.tenant_members
      where tenant_id = p_tenant and role = 'owner' and status = 'active' and user_id <> p_user
    ) then
      raise exception '工作空間至少需保留一位負責人' using errcode = 'P0001';
    end if;
  end if;

  update public.tenant_members
     set role = p_role,
         status = p_status,
         can_view_floor_price = p_can_view_floor_price,
         can_view_contact_pii = p_can_view_contact_pii,
         can_export = p_can_export,
         can_manage_files = p_can_manage_files
   where tenant_id = p_tenant and user_id = p_user;
end
$$;


-- ▼▼▼ 20261031000200_business.sql ▼▼▼
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


-- ▼▼▼ 20261031000300_rls_grants.sql ▼▼▼
-- =====================================================================
-- REBECCA ESTATE AI · Migration 03 · Row Level Security 與最小權限 grants
-- 原則：
--   1. anon 不可存取任何 public 資料表
--   2. authenticated 只拿到必要的 SELECT / INSERT / UPDATE；DELETE 僅限關聯表
--   3. 方案、訂閱、額度、用量、稽核、通知產生：前端不可寫
--   4. 一律由 RLS 判斷租戶成員資格與資源層級授權
-- =====================================================================

-- ---------- 先收回 Supabase 預設給 anon / authenticated 的權限 ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to authenticated;

-- RLS 輔助函式需讓 authenticated 執行
grant execute on function
  public.taipei_today(),
  public.next_workday(date),
  public.member_role_of(uuid),
  public.is_tenant_member(uuid),
  public.has_tenant_role(uuid, public.member_role),
  public.has_tenant_permission(uuid, text),
  public.is_property_assignee(uuid, uuid),
  public.can_edit_property(uuid, uuid),
  public.can_view_property_private(uuid, uuid),
  public.can_edit_contact(uuid, uuid),
  public.can_view_contact_pii(uuid, uuid),
  public.can_edit_deal(uuid, uuid)
to authenticated;

-- 使用者可呼叫的 RPC
grant execute on function public.create_tenant(text, text, public.tenant_kind) to authenticated;
grant execute on function public.update_tenant_member(uuid, uuid, public.member_role, public.member_status, boolean, boolean, boolean, boolean) to authenticated;

-- 僅 service_role（伺服器端排程 / 金流）
grant execute on function public.sync_entitlements(uuid) to service_role;
grant execute on function public.admin_set_plan(uuid, text, public.subscription_status) to service_role;
grant execute on function public.carry_over_tasks() to service_role;

-- ---------- 啟用 RLS（資料表擁有者 postgres 供 security definer 函式使用，不 FORCE） ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants','profiles','roles','tenant_members','plans','subscriptions','tenant_entitlements','usage_events','audit_logs',
    'properties','property_private','property_parcels','property_files','property_price_history','property_assignments',
    'contacts','contact_pii','property_contacts','buyer_requirements','contact_activities',
    'matches','seller_reports','listing_records','deals','offers','tasks','notifications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- =====================================================================
-- 平台層
-- =====================================================================
grant select on public.roles, public.plans to authenticated;
create policy roles_read on public.roles for select to authenticated using (true);
create policy plans_read on public.plans for select to authenticated using (is_active);

-- tenants：成員可讀；僅負責人可改名稱與設定
grant select on public.tenants to authenticated;
grant update (name, kind, settings) on public.tenants to authenticated;
create policy tenants_select on public.tenants for select to authenticated
  using (public.is_tenant_member(id));
create policy tenants_update on public.tenants for update to authenticated
  using (public.has_tenant_role(id, 'owner'))
  with check (public.has_tenant_role(id, 'owner'));

-- profiles：自己，或與自己同工作空間的成員（顯示名稱用）
grant select on public.profiles to authenticated;
grant update (display_name, phone, avatar_url, timezone) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.tenant_members mine
      join public.tenant_members theirs on theirs.tenant_id = mine.tenant_id
      where mine.user_id = (select auth.uid()) and mine.status = 'active' and theirs.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- tenant_members：同租戶成員可讀；寫入只能透過 RPC
grant select on public.tenant_members to authenticated;
create policy tenant_members_select on public.tenant_members for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- 訂閱與額度：成員可讀，前端不可寫
grant select on public.subscriptions, public.tenant_entitlements to authenticated;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy entitlements_select on public.tenant_entitlements for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- 用量與稽核：經理以上可讀，前端不可寫
grant select on public.usage_events, public.audit_logs to authenticated;
create policy usage_select on public.usage_events for select to authenticated
  using (public.has_tenant_role(tenant_id, 'manager'));
create policy audit_select on public.audit_logs for select to authenticated
  using (public.has_tenant_role(tenant_id, 'manager'));

-- 通知：只看自己的，只能標記已讀
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id))
  with check (user_id = (select auth.uid()));

-- =====================================================================
-- 房源
-- =====================================================================
grant select, insert, update on public.properties to authenticated;
create policy properties_select on public.properties for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy properties_insert on public.properties for insert to authenticated
  with check (
    public.has_tenant_role(tenant_id, 'agent')
    and (owner_agent_id = (select auth.uid()) or public.has_tenant_role(tenant_id, 'manager'))
  );
create policy properties_update on public.properties for update to authenticated
  using (public.can_edit_property(tenant_id, id))
  with check (public.can_edit_property(tenant_id, id));

grant select, insert, update on public.property_private to authenticated;
create policy property_private_select on public.property_private for select to authenticated
  using (public.can_view_property_private(tenant_id, property_id));
create policy property_private_insert on public.property_private for insert to authenticated
  with check (public.can_view_property_private(tenant_id, property_id) and public.can_edit_property(tenant_id, property_id));
create policy property_private_update on public.property_private for update to authenticated
  using (public.can_view_property_private(tenant_id, property_id) and public.can_edit_property(tenant_id, property_id))
  with check (public.can_view_property_private(tenant_id, property_id) and public.can_edit_property(tenant_id, property_id));

grant select, insert, update, delete on public.property_parcels to authenticated;
create policy parcels_select on public.property_parcels for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy parcels_insert on public.property_parcels for insert to authenticated
  with check (public.can_edit_property(tenant_id, property_id));
create policy parcels_update on public.property_parcels for update to authenticated
  using (public.can_edit_property(tenant_id, property_id))
  with check (public.can_edit_property(tenant_id, property_id));
create policy parcels_delete on public.property_parcels for delete to authenticated
  using (public.can_edit_property(tenant_id, property_id));

-- 檔案：restricted（謄本、合約等）僅限可看底價者
grant select, insert, update on public.property_files to authenticated;
create policy files_select on public.property_files for select to authenticated
  using (
    public.is_tenant_member(tenant_id)
    and (sensitivity <> 'restricted' or public.can_view_property_private(tenant_id, property_id))
  );
create policy files_insert on public.property_files for insert to authenticated
  with check (
    public.can_edit_property(tenant_id, property_id)
    and (sensitivity <> 'restricted' or public.can_view_property_private(tenant_id, property_id))
  );
create policy files_update on public.property_files for update to authenticated
  using (public.can_edit_property(tenant_id, property_id) and (sensitivity <> 'restricted' or public.can_view_property_private(tenant_id, property_id)))
  with check (public.can_edit_property(tenant_id, property_id) and (sensitivity <> 'restricted' or public.can_view_property_private(tenant_id, property_id)));

grant select on public.property_price_history to authenticated;
create policy price_history_select on public.property_price_history for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- 指派：經理以上，或該案主負責人
grant select, insert, update, delete on public.property_assignments to authenticated;
create policy assignments_select on public.property_assignments for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy assignments_write on public.property_assignments for all to authenticated
  using (
    public.has_tenant_role(tenant_id, 'manager')
    or exists (select 1 from public.properties p
               where p.tenant_id = property_assignments.tenant_id and p.id = property_assignments.property_id
                 and p.owner_agent_id = (select auth.uid()))
  )
  with check (
    public.has_tenant_role(tenant_id, 'manager')
    or exists (select 1 from public.properties p
               where p.tenant_id = property_assignments.tenant_id and p.id = property_assignments.property_id
                 and p.owner_agent_id = (select auth.uid()))
  );

-- =====================================================================
-- 客戶
-- =====================================================================
grant select, insert, update on public.contacts to authenticated;
create policy contacts_select on public.contacts for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (
    public.has_tenant_role(tenant_id, 'agent')
    and (owner_user_id = (select auth.uid()) or public.has_tenant_role(tenant_id, 'manager'))
  );
create policy contacts_update on public.contacts for update to authenticated
  using (public.can_edit_contact(tenant_id, id))
  with check (public.can_edit_contact(tenant_id, id));

grant select, insert, update on public.contact_pii to authenticated;
create policy contact_pii_select on public.contact_pii for select to authenticated
  using (public.can_view_contact_pii(tenant_id, contact_id));
create policy contact_pii_insert on public.contact_pii for insert to authenticated
  with check (public.can_view_contact_pii(tenant_id, contact_id) and public.can_edit_contact(tenant_id, contact_id));
create policy contact_pii_update on public.contact_pii for update to authenticated
  using (public.can_view_contact_pii(tenant_id, contact_id) and public.can_edit_contact(tenant_id, contact_id))
  with check (public.can_view_contact_pii(tenant_id, contact_id) and public.can_edit_contact(tenant_id, contact_id));

grant select, insert, delete on public.property_contacts to authenticated;
create policy property_contacts_select on public.property_contacts for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy property_contacts_insert on public.property_contacts for insert to authenticated
  with check (public.can_edit_property(tenant_id, property_id));
create policy property_contacts_delete on public.property_contacts for delete to authenticated
  using (public.can_edit_property(tenant_id, property_id));

grant select, insert, update on public.buyer_requirements to authenticated;
create policy requirements_select on public.buyer_requirements for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy requirements_insert on public.buyer_requirements for insert to authenticated
  with check (public.can_edit_contact(tenant_id, contact_id));
create policy requirements_update on public.buyer_requirements for update to authenticated
  using (public.can_edit_contact(tenant_id, contact_id))
  with check (public.can_edit_contact(tenant_id, contact_id));

-- 聯繫紀錄：業務只能以自己名義新增；修改限本人或經理
grant select, insert, update on public.contact_activities to authenticated;
create policy activities_select on public.contact_activities for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy activities_insert on public.contact_activities for insert to authenticated
  with check (
    public.has_tenant_role(tenant_id, 'agent')
    and (owner_user_id = (select auth.uid()) or public.has_tenant_role(tenant_id, 'manager'))
  );
create policy activities_update on public.contact_activities for update to authenticated
  using (owner_user_id = (select auth.uid()) and public.has_tenant_role(tenant_id, 'agent') or public.has_tenant_role(tenant_id, 'manager'))
  with check (owner_user_id = (select auth.uid()) and public.has_tenant_role(tenant_id, 'agent') or public.has_tenant_role(tenant_id, 'manager'));

-- =====================================================================
-- 配對、屋主回報、刊登
-- =====================================================================
grant select, insert, update on public.matches to authenticated;
create policy matches_select on public.matches for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy matches_insert on public.matches for insert to authenticated
  with check (public.has_tenant_role(tenant_id, 'agent'));
create policy matches_update on public.matches for update to authenticated
  using (public.has_tenant_role(tenant_id, 'agent'))
  with check (public.has_tenant_role(tenant_id, 'agent') and (confirmed_by is null or confirmed_by = (select auth.uid())));

grant select, insert, update on public.seller_reports to authenticated;
create policy seller_reports_select on public.seller_reports for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy seller_reports_insert on public.seller_reports for insert to authenticated
  with check (public.can_edit_property(tenant_id, property_id));
create policy seller_reports_update on public.seller_reports for update to authenticated
  using (public.can_edit_property(tenant_id, property_id))
  with check (public.can_edit_property(tenant_id, property_id) and (approved_by is null or approved_by = (select auth.uid())));

grant select, insert, update on public.listing_records to authenticated;
create policy listing_select on public.listing_records for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy listing_insert on public.listing_records for insert to authenticated
  with check (public.can_edit_property(tenant_id, property_id));
create policy listing_update on public.listing_records for update to authenticated
  using (public.can_edit_property(tenant_id, property_id))
  with check (public.can_edit_property(tenant_id, property_id));

-- =====================================================================
-- 成交與議價
-- =====================================================================
grant select, insert, update on public.deals to authenticated;
create policy deals_select on public.deals for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy deals_insert on public.deals for insert to authenticated
  with check (
    public.has_tenant_role(tenant_id, 'agent')
    and (owner_user_id = (select auth.uid()) or public.has_tenant_role(tenant_id, 'manager'))
  );
create policy deals_update on public.deals for update to authenticated
  using (public.can_edit_deal(tenant_id, id))
  with check (public.can_edit_deal(tenant_id, id));

grant select, insert, update on public.offers to authenticated;
create policy offers_select on public.offers for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy offers_insert on public.offers for insert to authenticated
  with check (public.can_edit_deal(tenant_id, deal_id));
create policy offers_update on public.offers for update to authenticated
  using (public.can_edit_deal(tenant_id, deal_id))
  with check (public.can_edit_deal(tenant_id, deal_id));

-- =====================================================================
-- 任務：同租戶可讀；指派對象 / 建立者 / 經理可改
-- =====================================================================
grant select, insert, update on public.tasks to authenticated;
grant select on public.v_tasks to authenticated;
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    public.has_tenant_role(tenant_id, 'agent')
    and (assignee_id = (select auth.uid()) or public.has_tenant_role(tenant_id, 'manager'))
  );
create policy tasks_update on public.tasks for update to authenticated
  using (
    public.has_tenant_role(tenant_id, 'manager')
    or (public.has_tenant_role(tenant_id, 'agent') and (assignee_id = (select auth.uid()) or created_by = (select auth.uid())))
  )
  with check (
    public.has_tenant_role(tenant_id, 'manager')
    or (public.has_tenant_role(tenant_id, 'agent') and (assignee_id = (select auth.uid()) or created_by = (select auth.uid())))
  );


-- ▼▼▼ 20261031000400_storage.sql ▼▼▼
-- =====================================================================
-- REBECCA ESTATE AI · Migration 04 · Storage 私有檔案
-- 路徑：{tenant_id}/{property_id}/{file_id}/{檔名}
-- 必須先建立 property_files 中繼資料，才能上傳；下載一律透過短效 signed URL
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('property-files', 'property-files', false, 52428800)
on conflict (id) do update set public = false;

create or replace function public.can_read_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.property_files f
    where f.storage_path = p_name
      and f.deleted_at is null
      and public.is_tenant_member(f.tenant_id)
      and (f.sensitivity <> 'restricted' or public.can_view_property_private(f.tenant_id, f.property_id))
  )
$$;

create or replace function public.can_write_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.property_files f
    where f.storage_path = p_name
      and f.deleted_at is null
      and public.can_edit_property(f.tenant_id, f.property_id)
      and (f.sensitivity <> 'restricted' or public.can_view_property_private(f.tenant_id, f.property_id))
  )
$$;

grant execute on function public.can_read_storage_object(text), public.can_write_storage_object(text) to authenticated;

create policy "property-files read" on storage.objects for select to authenticated
  using (bucket_id = 'property-files' and public.can_read_storage_object(name));

create policy "property-files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-files' and public.can_write_storage_object(name));

create policy "property-files delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'property-files'
    and exists (
      select 1 from public.property_files f
      where f.storage_path = storage.objects.name
        and public.has_tenant_role(f.tenant_id, 'manager')
    )
  );


-- ▼▼▼ 20261101000500_phase2.sql ▼▼▼
-- =====================================================================
-- REBECCA ESTATE AI · Migration 05 · Phase 2
-- 成員邀請、個人提醒設定、站內提醒產生、重複資料偵測、聯絡人原子建立
-- =====================================================================

-- ---------- 正規化工具 ----------
create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    case
      when d like '886%' and length(d) >= 11 then '0' || substr(d, 4)
      else d
    end, '')
  from (select regexp_replace(translate(coalesce(p, ''), '０１２３４５６７８９', '0123456789'), '\D', '', 'g') as d) s
$$;

create or replace function public.normalize_address(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      replace(lower(translate(coalesce(p, ''), '０１２３４５６７８９－　', '0123456789- ')), '臺', '台'),
      '[\s\-,，、]', '', 'g'),
    '')
$$;

alter table public.contact_pii
  add column phone_normalized text generated always as (public.normalize_phone(phone)) stored,
  add column email_normalized text generated always as (nullif(lower(btrim(email)), '')) stored;
create index contact_pii_phone_norm_idx on public.contact_pii (tenant_id, phone_normalized) where phone_normalized is not null;
create index contact_pii_email_norm_idx on public.contact_pii (tenant_id, email_normalized) where email_normalized is not null;

create index properties_address_norm_idx on public.properties (tenant_id, public.normalize_address(address)) where deleted_at is null;

-- 稽核：衍生欄位（*_normalized）不視為異動
create or replace function public.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_fields text[];
  v_tenant uuid;
  v_id text;
  v_redact boolean := coalesce(tg_argv[0], '') = 'redact';
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  if tg_table_name = 'tenants' then
    v_tenant := (v_row ->> 'id')::uuid;
  else
    v_tenant := (v_row ->> 'tenant_id')::uuid;
  end if;
  v_id := coalesce(v_row ->> 'id', v_row ->> 'property_id', v_row ->> 'contact_id', v_row ->> 'user_id');

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_fields
    from jsonb_each(v_new) as n(key, value)
    where n.value is distinct from (v_old -> n.key)
      and n.key <> 'updated_at'
      and n.key not like '%\_normalized';
    if v_fields is null then
      return new;
    end if;
    select jsonb_object_agg(k, v_old -> k), jsonb_object_agg(k, v_new -> k)
      into v_old, v_new
    from unnest(v_fields) as k;
  else
    select array_agg(k order by k) into v_fields from jsonb_object_keys(v_row) as k where k not like '%\_normalized';
  end if;

  if v_redact then
    v_old := null;
    v_new := null;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, table_name, record_id, changed_fields, old_values, new_values)
  values (v_tenant, auth.uid(), lower(tg_op), tg_table_name, v_id, v_fields, v_old, v_new);

  return coalesce(new, old);
end
$$;

-- =====================================================================
-- 成員邀請
-- =====================================================================
create table public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%@%'),
  role public.member_role not null check (role <> 'owner'),
  can_view_floor_price boolean not null default false,
  can_view_contact_pii boolean not null default false,
  can_export boolean not null default false,
  can_manage_files boolean not null default false,
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index tenant_invitations_tenant_idx on public.tenant_invitations (tenant_id, created_at desc);
create unique index tenant_invitations_pending_email on public.tenant_invitations (tenant_id, email)
  where accepted_at is null and revoked_at is null;

create trigger tenant_invitations_audit after insert or update or delete on public.tenant_invitations
  for each row execute function public.tg_audit();

-- 回傳一次性 token（明文只出現在回傳值，資料庫只存雜湊）
create or replace function public.invite_member(
  p_tenant uuid,
  p_email text,
  p_role public.member_role,
  p_can_view_floor_price boolean default false,
  p_can_view_contact_pii boolean default false,
  p_can_export boolean default false,
  p_can_manage_files boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.member_role := public.member_role_of(p_tenant);
  v_email text := lower(btrim(p_email));
  v_token text;
begin
  if v_actor is null or v_actor < 'manager' then
    raise exception '權限不足' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception '無法以邀請方式指定負責人' using errcode = 'P0001';
  end if;
  if v_actor = 'manager' and p_role >= 'manager' then
    raise exception '經理只能邀請業務或檢視者' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email 格式不正確' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.tenant_members m join auth.users u on u.id = m.user_id
    where m.tenant_id = p_tenant and lower(u.email) = v_email
  ) then
    raise exception '此 Email 已是工作空間成員' using errcode = 'P0001';
  end if;

  -- 同一 Email 舊的待接受邀請作廢
  update public.tenant_invitations set revoked_at = now()
   where tenant_id = p_tenant and email = v_email and accepted_at is null and revoked_at is null;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.tenant_invitations
    (tenant_id, email, role, can_view_floor_price, can_view_contact_pii, can_export, can_manage_files, token_hash, invited_by)
  values
    (p_tenant, v_email, p_role, p_can_view_floor_price, p_can_view_contact_pii, p_can_export, p_can_manage_files,
     encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid());
  return v_token;
end
$$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.tenant_invitations where id = p_invitation;
  if v_tenant is null or not public.has_tenant_role(v_tenant, 'manager') then
    raise exception '權限不足' using errcode = '42501';
  end if;
  update public.tenant_invitations set revoked_at = now()
   where id = p_invitation and accepted_at is null and revoked_at is null;
end
$$;

-- 接受邀請：登入帳號 Email 必須與邀請 Email 相同
create or replace function public.accept_invitation(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.tenant_invitations;
  v_slug text;
begin
  if v_uid is null then
    raise exception '需要登入' using errcode = '42501';
  end if;

  select * into v_inv from public.tenant_invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
   for update;

  if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null or v_inv.expires_at < now() then
    raise exception '邀請連結無效或已過期' using errcode = 'P0001';
  end if;
  if v_inv.email <> v_email then
    raise exception '此邀請寄給其他 Email，請以受邀帳號登入' using errcode = '42501';
  end if;
  if exists (select 1 from public.tenant_members where tenant_id = v_inv.tenant_id and user_id = v_uid) then
    raise exception '你已是此工作空間成員' using errcode = 'P0001';
  end if;

  insert into public.tenant_members
    (tenant_id, user_id, role, status, invited_by, joined_at, can_view_floor_price, can_view_contact_pii, can_export, can_manage_files)
  values
    (v_inv.tenant_id, v_uid, v_inv.role, 'active', v_inv.invited_by, now(),
     v_inv.can_view_floor_price, v_inv.can_view_contact_pii, v_inv.can_export, v_inv.can_manage_files);

  update public.tenant_invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;

  select slug into v_slug from public.tenants where id = v_inv.tenant_id;
  return v_slug;
end
$$;

-- =====================================================================
-- 個人提醒設定（每人自己的工作時段）
-- =====================================================================
create table public.member_preferences (
  tenant_id uuid not null,
  user_id uuid not null,
  reminders_enabled boolean not null default true,
  include_weekends boolean not null default false,
  morning_time time not null default '10:00',
  evening_time time not null default '19:00',
  weekly_dow smallint not null default 5 check (weekly_dow between 1 and 7), -- ISO：1=週一 … 5=週五
  weekly_time time not null default '19:00',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  foreign key (tenant_id, user_id) references public.tenant_members (tenant_id, user_id) on delete cascade
);
create trigger member_preferences_updated_at before update on public.member_preferences
  for each row execute function public.tg_set_updated_at();
create trigger member_preferences_guard_tenant before update on public.member_preferences
  for each row execute function public.tg_guard_tenant_id();

-- =====================================================================
-- 站內提醒產生（排程每小時以 service_role 執行；可重複執行，以 dedupe_key 去重）
-- 上午 TOP 3、晚上回顧、每週結算、委託到期（7/3/1 天前）
-- =====================================================================
create or replace function public.generate_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Taipei';
  v_date date := (p_now at time zone 'Asia/Taipei')::date;
  v_time time := (p_now at time zone 'Asia/Taipei')::time;
  v_dow int := extract(isodow from (p_now at time zone 'Asia/Taipei'))::int;
  v_week_start date := (p_now at time zone 'Asia/Taipei')::date - (extract(isodow from (p_now at time zone 'Asia/Taipei'))::int - 1);
  v_count integer := 0;
  v_n integer;
  r record;
  v_body text;
  v_done int; v_progress int; v_open int; v_blocked int; v_stale int; v_follow int;
begin
  for r in
    select m.tenant_id, m.user_id, t.slug,
           coalesce(p.reminders_enabled, true) as enabled,
           coalesce(p.include_weekends, false) as weekends,
           coalesce(p.morning_time, '10:00'::time) as morning_time,
           coalesce(p.evening_time, '19:00'::time) as evening_time,
           coalesce(p.weekly_dow, 5) as weekly_dow,
           coalesce(p.weekly_time, '19:00'::time) as weekly_time
    from public.tenant_members m
    join public.tenants t on t.id = m.tenant_id and t.deleted_at is null
    left join public.member_preferences p on p.tenant_id = m.tenant_id and p.user_id = m.user_id
    where m.status = 'active'
  loop
    continue when not r.enabled;
    continue when not r.weekends and v_dow in (6, 7);

    -- 上午：今日優先 TOP 3 + 逾期追蹤 + 委託到期
    if v_time >= r.morning_time and v_time < r.morning_time + interval '1 hour' then
      select string_agg(format('%s. %s', rn, title), E'\n' order by rn) into v_body
      from (
        select row_number() over (
                 order by (t.due_at is not null and t.due_at < p_now) desc, t.priority, t.due_at nulls last, t.original_date, t.id) as rn,
               t.title
        from public.tasks t
        where t.tenant_id = r.tenant_id and t.assignee_id = r.user_id and t.deleted_at is null
          and t.status in ('todo', 'in_progress', 'blocked') and t.scheduled_date <= v_date
      ) x where rn <= 3;

      select count(*) into v_follow from public.contacts c
      where c.tenant_id = r.tenant_id and c.owner_user_id = r.user_id and c.deleted_at is null
        and c.archived_at is null and c.next_follow_up_at < p_now;

      insert into public.notifications (tenant_id, user_id, kind, title, body, link, dedupe_key)
      values (r.tenant_id, r.user_id, 'morning_top3', '今日優先 TOP 3',
              coalesce(v_body, '今天沒有待辦。') || case when v_follow > 0 then format(E'\n另有 %s 位客戶已超過追蹤時間。', v_follow) else '' end,
              '/w/' || r.slug || '/tasks', 'morning:' || v_date)
      on conflict (tenant_id, user_id, dedupe_key) do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;

      insert into public.notifications (tenant_id, user_id, kind, title, body, link, dedupe_key)
      select r.tenant_id, r.user_id, 'mandate_expiring',
             format('委託 %s 天後到期：%s', p.mandate_end_date - v_date, p.title),
             format('案件 %s 委託到期日 %s，請與屋主確認續約或調整。', p.code, p.mandate_end_date),
             '/w/' || r.slug || '/properties/' || p.id,
             format('mandate:%s:%s:%s', p.id, p.mandate_end_date, p.mandate_end_date - v_date)
      from public.properties p
      where p.tenant_id = r.tenant_id and p.owner_agent_id = r.user_id and p.deleted_at is null
        and p.archived_at is null and p.status in ('draft', 'active', 'negotiating')
        and p.mandate_end_date - v_date in (7, 3, 1)
      on conflict (tenant_id, user_id, dedupe_key) do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;
    end if;

    -- 晚上：今日完成、進行中、未完成、卡點
    if v_time >= r.evening_time and v_time < r.evening_time + interval '1 hour' then
      select
        count(*) filter (where t.status = 'done' and (t.completed_at at time zone 'Asia/Taipei')::date = v_date),
        count(*) filter (where t.status = 'in_progress'),
        count(*) filter (where t.status in ('todo', 'in_progress', 'blocked') and t.scheduled_date <= v_date),
        count(*) filter (where t.status = 'blocked')
      into v_done, v_progress, v_open, v_blocked
      from public.tasks t
      where t.tenant_id = r.tenant_id and t.assignee_id = r.user_id and t.deleted_at is null;

      insert into public.notifications (tenant_id, user_id, kind, title, body, link, dedupe_key)
      values (r.tenant_id, r.user_id, 'evening_review', '今日回顧',
              format(E'今日完成 %s 項・進行中 %s 項・未完成 %s 項・卡關 %s 項', v_done, v_progress, v_open, v_blocked),
              '/w/' || r.slug || '/tasks?view=review', 'evening:' || v_date)
      on conflict (tenant_id, user_id, dedupe_key) do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;
    end if;

    -- 每週結算
    if v_dow = r.weekly_dow and v_time >= r.weekly_time and v_time < r.weekly_time + interval '1 hour' then
      select
        count(*) filter (where t.status = 'done' and (t.completed_at at time zone 'Asia/Taipei')::date >= v_week_start),
        count(*) filter (where t.status in ('todo', 'in_progress', 'blocked')),
        count(*) filter (where t.status in ('todo', 'in_progress', 'blocked') and v_date - t.original_date > 2)
      into v_done, v_open, v_stale
      from public.tasks t
      where t.tenant_id = r.tenant_id and t.assignee_id = r.user_id and t.deleted_at is null;

      insert into public.notifications (tenant_id, user_id, kind, title, body, link, dedupe_key)
      values (r.tenant_id, r.user_id, 'weekly_summary', '本週結算',
              format(E'本週完成 %s 項・尚未完成 %s 項（其中 %s 項超過兩天）', v_done, v_open, v_stale),
              '/w/' || r.slug || '/tasks?view=week', 'weekly:' || v_week_start)
      on conflict (tenant_id, user_id, dedupe_key) do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;
    end if;
  end loop;
  return v_count;
end
$$;

-- =====================================================================
-- 重複資料偵測
-- =====================================================================
-- 物件：一般成員本來就能讀物件，故以呼叫者身分執行（受 RLS 約束）
create or replace function public.find_duplicate_properties(
  p_tenant uuid,
  p_title text,
  p_address text,
  p_parcel_nos text[] default '{}',
  p_exclude uuid default null
)
returns table (id uuid, code text, title text, reason text)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.code, p.title,
         string_agg(distinct x.reason, '、') as reason
  from public.properties p
  join lateral (
    select '地址相同' as reason
     where public.normalize_address(p_address) is not null
       and public.normalize_address(p.address) = public.normalize_address(p_address)
    union all
    select '名稱相同' where btrim(lower(p.title)) = btrim(lower(coalesce(p_title, '')))
    union all
    select '地號相同' where exists (
      select 1 from public.property_parcels pp
      where pp.tenant_id = p.tenant_id and pp.property_id = p.id
        and pp.parcel_no = any (p_parcel_nos))
  ) x on true
  where p.tenant_id = p_tenant and p.deleted_at is null
    and (p_exclude is null or p.id <> p_exclude)
  group by p.id, p.code, p.title
  limit 10
$$;

-- 客戶：需比對電話/Email，但呼叫者可能沒有個資權限，
-- 因此以 definer 執行，只回傳客戶名稱與比對原因，不回傳任何個資
create or replace function public.find_duplicate_contacts(
  p_tenant uuid,
  p_display_name text,
  p_phone text,
  p_email text,
  p_exclude uuid default null
)
returns table (id uuid, display_name text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_role(p_tenant, 'agent') then
    return;
  end if;
  return query
  select c.id, c.display_name, string_agg(distinct x.reason, '、')
  from public.contacts c
  left join public.contact_pii pii on pii.tenant_id = c.tenant_id and pii.contact_id = c.id
  join lateral (
    select '電話相同'::text as reason
     where public.normalize_phone(p_phone) is not null and pii.phone_normalized = public.normalize_phone(p_phone)
    union all
    select 'Email 相同' where nullif(lower(btrim(p_email)), '') is not null and pii.email_normalized = lower(btrim(p_email))
    union all
    select '姓名相同' where btrim(c.display_name) = btrim(coalesce(p_display_name, ''))
  ) x on true
  where c.tenant_id = p_tenant and c.deleted_at is null
    and (p_exclude is null or c.id <> p_exclude)
  group by c.id, c.display_name
  limit 10;
end
$$;

-- =====================================================================
-- 建立聯絡人 + 聯絡資訊（同一交易；以呼叫者身分執行，RLS 照常生效）
-- =====================================================================
create or replace function public.create_contact(p_contact jsonb, p_pii jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.contacts (
    tenant_id, contact_types, display_name, company, job_title, source, is_public_lead, public_source_url,
    owner_user_id, grade, stage, marketing_consent, consent_recorded_at, do_not_contact, next_follow_up_at, notes)
  values (
    (p_contact ->> 'tenant_id')::uuid,
    (select coalesce(array_agg(v::public.contact_type), '{}') from jsonb_array_elements_text(p_contact -> 'contact_types') v),
    p_contact ->> 'display_name',
    nullif(p_contact ->> 'company', ''),
    nullif(p_contact ->> 'job_title', ''),
    nullif(p_contact ->> 'source', ''),
    coalesce((p_contact ->> 'is_public_lead')::boolean, false),
    nullif(p_contact ->> 'public_source_url', ''),
    (p_contact ->> 'owner_user_id')::uuid,
    nullif(p_contact ->> 'grade', '')::public.contact_grade,
    coalesce(nullif(p_contact ->> 'stage', ''), 'not_contacted')::public.contact_stage,
    coalesce(nullif(p_contact ->> 'marketing_consent', ''), 'unknown')::public.consent_status,
    case when coalesce(p_contact ->> 'marketing_consent', 'unknown') <> 'unknown' then now() end,
    coalesce((p_contact ->> 'do_not_contact')::boolean, false),
    nullif(p_contact ->> 'next_follow_up_at', '')::timestamptz,
    nullif(p_contact ->> 'notes', ''))
  returning id into v_id;

  if p_pii is not null and (
       nullif(p_pii ->> 'phone', '') is not null or nullif(p_pii ->> 'phone_alt', '') is not null
    or nullif(p_pii ->> 'email', '') is not null or nullif(p_pii ->> 'line_id', '') is not null
    or nullif(p_pii ->> 'address', '') is not null) then
    insert into public.contact_pii (tenant_id, contact_id, phone, phone_alt, email, line_id, address)
    values ((p_contact ->> 'tenant_id')::uuid, v_id,
            nullif(p_pii ->> 'phone', ''), nullif(p_pii ->> 'phone_alt', ''), nullif(p_pii ->> 'email', ''),
            nullif(p_pii ->> 'line_id', ''), nullif(p_pii ->> 'address', ''));
  end if;
  return v_id;
end
$$;

-- =====================================================================
-- RLS 與 grants
-- =====================================================================
alter table public.tenant_invitations enable row level security;
alter table public.member_preferences enable row level security;

grant select on public.tenant_invitations to authenticated;
create policy invitations_select on public.tenant_invitations for select to authenticated
  using (public.has_tenant_role(tenant_id, 'manager'));

grant select, insert, update on public.member_preferences to authenticated;
create policy prefs_select on public.member_preferences for select to authenticated
  using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));
create policy prefs_insert on public.member_preferences for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));
create policy prefs_update on public.member_preferences for update to authenticated
  using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id))
  with check (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.taipei_today(), public.next_workday(date), public.member_role_of(uuid), public.is_tenant_member(uuid),
  public.has_tenant_role(uuid, public.member_role), public.has_tenant_permission(uuid, text),
  public.is_property_assignee(uuid, uuid), public.can_edit_property(uuid, uuid), public.can_view_property_private(uuid, uuid),
  public.can_edit_contact(uuid, uuid), public.can_view_contact_pii(uuid, uuid), public.can_edit_deal(uuid, uuid),
  public.can_read_storage_object(text), public.can_write_storage_object(text),
  public.normalize_phone(text), public.normalize_address(text),
  public.create_tenant(text, text, public.tenant_kind),
  public.update_tenant_member(uuid, uuid, public.member_role, public.member_status, boolean, boolean, boolean, boolean),
  public.invite_member(uuid, text, public.member_role, boolean, boolean, boolean, boolean),
  public.revoke_invitation(uuid),
  public.accept_invitation(text),
  public.find_duplicate_properties(uuid, text, text, text[], uuid),
  public.find_duplicate_contacts(uuid, text, text, text, uuid),
  public.create_contact(jsonb, jsonb)
to authenticated;
grant execute on function public.generate_reminders(timestamptz) to service_role;


-- ▼▼▼ 20261101000600_schedules.sql ▼▼▼
-- =====================================================================
-- REBECCA ESTATE AI · Migration 06 · 伺服器排程（Supabase pg_cron）
-- 有 pg_cron 的環境（Supabase）自動建立排程；沒有的環境（本機測試）略過。
-- 排程可重複建立（同名 job 會覆蓋）。
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- 每天台北 00:05（UTC 16:05）：未完成任務延續到下一工作日
    execute $q$ select cron.schedule('rea-carry-over-tasks', '5 16 * * *', 'select public.carry_over_tasks()') $q$;
    -- 每小時第 2 分：依每人設定產生 TOP 3／回顧／週結算／委託到期提醒
    execute $q$ select cron.schedule('rea-generate-reminders', '2 * * * *', 'select public.generate_reminders()') $q$;
  else
    raise notice 'pg_cron 不可用：請改用 /api/cron/daily（見 docs/SETUP.md）';
  end if;
end
$$;
