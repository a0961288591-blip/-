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
