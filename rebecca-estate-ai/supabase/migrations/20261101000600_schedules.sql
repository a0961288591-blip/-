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
