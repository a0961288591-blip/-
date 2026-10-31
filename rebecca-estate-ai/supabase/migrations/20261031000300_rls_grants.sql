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
