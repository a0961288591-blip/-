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
