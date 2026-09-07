-- Удаление прямых обращений RLS-политик к public.profiles.
-- Основано на read-only инвентаризации действующей production-схемы.
-- Повторный запуск безопасен для этой версии схемы.

begin;

create or replace function public.kd_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role = any(allowed_roles)
  )
$function$;

revoke all on function public.kd_has_role(text[]) from public, anon;
grant execute on function public.kd_has_role(text[]) to authenticated, service_role;

alter policy stage3_manage_client_events on public.client_events
  using (public.kd_has_role(array['admin', 'manager']))
  with check (public.kd_has_role(array['admin', 'manager']));

alter policy stage2_write_followups on public.client_followups
  using (public.kd_has_role(array['admin', 'manager']))
  with check (public.kd_has_role(array['admin', 'manager']));

alter policy stage3_read_public_feedback on public.client_public_feedback
  using (public.kd_has_role(array['admin', 'manager']));

alter policy guarantee_returns_all on public.guarantee_returns
  using (public.kd_has_role(array['admin', 'manager']))
  with check (public.kd_has_role(array['admin', 'manager']));

alter policy lead_stages_admin on public.lead_stages
  using (public.kd_has_role(array['admin', 'manager']))
  with check (public.kd_has_role(array['admin', 'manager']));

alter policy lead_stages_select on public.lead_stages
  using (public.kd_has_role(array['admin', 'manager']));

alter policy leads_all on public.leads
  using (public.kd_has_role(array['admin', 'manager']))
  with check (public.kd_has_role(array['admin', 'manager']));

alter policy stage2_write_quality on public.quality_checks
  using (public.kd_has_role(array['admin', 'manager']))
  with check (public.kd_has_role(array['admin', 'manager']));

alter policy stage2_write_contracts on public.service_contracts
  using (public.kd_has_role(array['admin', 'manager']))
  with check (public.kd_has_role(array['admin', 'manager']));

alter policy tasks_insert on public.tasks
  with check (public.kd_has_role(array['admin', 'manager']));

alter policy tasks_select on public.tasks
  using (
    public.kd_has_role(array['admin', 'manager'])
    or assignee_id = auth.uid()
    or created_by = auth.uid()
  );

alter policy tasks_update on public.tasks
  using (public.kd_has_role(array['admin', 'manager']) or assignee_id = auth.uid())
  with check (public.kd_has_role(array['admin', 'manager']) or assignee_id = auth.uid());

alter policy tech_days_off_write on public.tech_days_off
  using (public.kd_has_role(array['admin', 'manager']))
  with check (public.kd_has_role(array['admin', 'manager']));

alter policy tender_guarantees_all on public.tender_guarantees
  using (public.kd_has_role(array['admin', 'manager']))
  with check (public.kd_has_role(array['admin', 'manager']));

alter policy tender_services_all on public.tender_services
  using (public.kd_has_role(array['admin', 'manager']))
  with check (public.kd_has_role(array['admin', 'manager']));

alter policy tenders_admin on public.tenders
  using (public.kd_has_role(array['admin', 'manager']))
  with check (public.kd_has_role(array['admin', 'manager']));

alter policy tenders_select on public.tenders
  using (public.kd_has_role(array['admin', 'manager']));

-- Теперь ни одна production-политика не требует прямого чтения этих полей.
revoke select on table public.profiles from anon, authenticated;
grant select (id) on table public.profiles to authenticated;

notify pgrst, 'reload schema';

commit;
