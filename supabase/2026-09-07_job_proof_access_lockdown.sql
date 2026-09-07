-- Приватность фото, геолокации и подписей по заявкам.
-- Доступ получает только назначенный исполнитель либо сотрудник, которому
-- разрешено управлять заявками. Проверка одинакова для таблицы и Storage.
-- Повторный запуск безопасен.

begin;

do $migration$
begin
  if to_regprocedure('public.kd_account_active()') is null then
    raise exception 'Required function public.kd_account_active() was not found';
  end if;
  if to_regprocedure('public.kd_has_permission(text)') is null then
    raise exception 'Required function public.kd_has_permission(text) was not found';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Required function public.is_admin() was not found';
  end if;
end
$migration$;

-- Принимает text, потому что первая папка Storage — строка. Сравнение через
-- job.id::text безопасно: повреждённый или посторонний путь вернёт false,
-- а не уронит запрос ошибкой преобразования uuid.
create or replace function public.kd_can_access_job_proof(p_job_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    coalesce(public.kd_account_active(), false)
    and exists (
      select 1
      from public.jobs j
      where j.id::text = p_job_id
        and (
          j.assigned_to = auth.uid()
          or public.is_admin()
          or public.kd_has_permission('action.jobs_edit')
        )
    )
$function$;

revoke all on function public.kd_can_access_job_proof(text) from public, anon;
grant execute on function public.kd_can_access_job_proof(text) to authenticated, service_role;

-- Метаданные подтверждения: обычный специалист видит и обновляет только
-- подтверждение своей заявки. Руководитель заявок сохраняет рабочий обзор.
drop policy if exists "job_proofs select" on public.job_proofs;
create policy "job_proofs select" on public.job_proofs
  for select to authenticated
  using (public.kd_can_access_job_proof(job_id::text));

drop policy if exists "job_proofs insert" on public.job_proofs;
create policy "job_proofs insert" on public.job_proofs
  for insert to authenticated
  with check (public.kd_can_access_job_proof(job_id::text));

drop policy if exists "job_proofs update" on public.job_proofs;
create policy "job_proofs update" on public.job_proofs
  for update to authenticated
  using (public.kd_can_access_job_proof(job_id::text))
  with check (public.kd_can_access_job_proof(job_id::text));

-- Ограничительная политика остаётся последним рубежом, даже если позднее
-- кто-то по ошибке добавит ещё одну разрешающую policy с using (true).
drop policy if exists "job_proofs access scope" on public.job_proofs;
create policy "job_proofs access scope" on public.job_proofs
  as restrictive for all to authenticated
  using (public.kd_can_access_job_proof(job_id::text))
  with check (public.kd_can_access_job_proof(job_id::text));

-- Даже если бакет когда-то случайно переключили в public, миграция возвращает
-- его в закрытое состояние. В пути приложения первая папка всегда равна job.id.
insert into storage.buckets (id, name, public)
values ('job-proofs', 'job-proofs', false)
on conflict (id) do update set public = false;

-- Аналогичный ограничительный барьер защищает файлы от случайной будущей
-- permissive-policy. Другие бакеты выражение не затрагивает.
drop policy if exists "job-proofs access scope" on storage.objects;
create policy "job-proofs access scope" on storage.objects
  as restrictive for all to authenticated
  using (
    bucket_id <> 'job-proofs'
    or public.kd_can_access_job_proof((storage.foldername(name))[1])
  )
  with check (
    bucket_id <> 'job-proofs'
    or public.kd_can_access_job_proof((storage.foldername(name))[1])
  );

drop policy if exists "job-proofs read" on storage.objects;
create policy "job-proofs read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'job-proofs'
    and public.kd_can_access_job_proof((storage.foldername(name))[1])
  );

drop policy if exists "job-proofs upload" on storage.objects;
create policy "job-proofs upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'job-proofs'
    and public.kd_can_access_job_proof((storage.foldername(name))[1])
  );

notify pgrst, 'reload schema';

commit;

-- Контроль после применения:
-- select id, public from storage.buckets where id = 'job-proofs';
-- select schemaname, tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where (schemaname = 'public' and tablename = 'job_proofs')
--    or (schemaname = 'storage' and tablename = 'objects'
--        and policyname like 'job-proofs%')
-- order by schemaname, policyname;
