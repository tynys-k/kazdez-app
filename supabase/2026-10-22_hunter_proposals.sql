-- КП для хантера. Раздел «КП» открывается персональным доступом
-- («Сотрудники и доступы» → «Разрешить» для «КП»), а политики proposals
-- пускают любого с tab.proposals ко всем КП компании. Хантеру оставляем
-- только свои КП и КП по своим сделкам — так же, как с лидами.

begin;

do $dependencies$
begin
  if to_regclass('public.proposals') is null
     or to_regprocedure('public.kd_is_hunter()') is null then
    raise exception 'Сначала примените 2026-09-17_proposals.sql и 2026-10-22_hunter_role.sql: доступ к КП не был изменён';
  end if;
end
$dependencies$;

drop policy if exists proposals_hunter_own on public.proposals;
create policy proposals_hunter_own on public.proposals
  as restrictive for all to authenticated
  using (
    not public.kd_is_hunter()
    or author_id = auth.uid()
    or exists (select 1 from public.leads l where l.id = proposals.lead_id and l.owner_id = auth.uid())
  )
  with check (
    not public.kd_is_hunter()
    or author_id = auth.uid()
    or exists (select 1 from public.leads l where l.id = proposals.lead_id and l.owner_id = auth.uid())
  );

notify pgrst, 'reload schema';
commit;
