-- Передача оборудования закрывает старую выдачу и создаёт новую одной транзакцией.
-- Связь с исходной выдачей делает повторный запрос безопасным и проверяемым.

begin;

do $migration$
begin
  if to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_permission(text)') is null
     or to_regclass('public.equipment_handouts') is null
     or to_regclass('public.profiles') is null then
    raise exception 'Required access-control functions, equipment_handouts or profiles were not found';
  end if;
end
$migration$;

alter table public.equipment_handouts
  add column if not exists transfer_source_id uuid
  references public.equipment_handouts(id) on delete restrict;

create unique index if not exists equipment_handouts_transfer_source_key
  on public.equipment_handouts (transfer_source_id)
  where transfer_source_id is not null;

create or replace function public.kd_validate_equipment_transfer()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_source public.equipment_handouts%rowtype;
begin
  if tg_op = 'DELETE' then
    if old.transfer_source_id is not null and exists (
      select 1 from public.equipment_handouts
       where id = old.transfer_source_id and status = 'transferred'
    ) then
      raise exception using errcode = '23503', message = 'Нельзя удалить новую выдачу и оставить исходное оборудование переданным';
    end if;
    return old;
  end if;

  if new.status = 'transferred' and not exists (
    select 1 from public.equipment_handouts
     where transfer_source_id = new.id
  ) then
    raise exception using errcode = '23514', message = 'Передача оборудования должна одновременно создать выдачу новому сотруднику';
  end if;

  if new.transfer_source_id is not null then
    select * into v_source
      from public.equipment_handouts
     where id = new.transfer_source_id;
    if not found or v_source.status <> 'transferred' then
      raise exception using errcode = '23514', message = 'Исходная выдача не отмечена переданной';
    end if;
    if new.equipment_id is distinct from v_source.equipment_id
       or new.qty is distinct from v_source.qty
       or new.tech_id is not distinct from v_source.tech_id then
      raise exception using errcode = '23514', message = 'Новая выдача не соответствует передаваемому оборудованию';
    end if;
  end if;

  return new;
end
$function$;

drop trigger if exists equipment_transfer_integrity on public.equipment_handouts;
create constraint trigger equipment_transfer_integrity
after insert or update or delete on public.equipment_handouts
deferrable initially deferred
for each row execute function public.kd_validate_equipment_transfer();

create or replace function public.transfer_equipment_atomic(
  p_handout_id uuid,
  p_new_tech_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_source public.equipment_handouts%rowtype;
  v_existing public.equipment_handouts%rowtype;
  v_new_id uuid;
  v_source_name text;
  v_note text;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_permission('action.team_manage')
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для передачи оборудования';
  end if;
  if p_handout_id is null or p_new_tech_id is null then
    raise exception using errcode = '22004', message = 'Оборудование и новый сотрудник обязательны';
  end if;
  v_note := nullif(btrim(p_note), '');
  if length(coalesce(v_note, '')) > 2000 then
    raise exception using errcode = '22023', message = 'Комментарий слишком длинный';
  end if;

  select * into v_source
    from public.equipment_handouts
   where id = p_handout_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Выдача оборудования не найдена';
  end if;

  select * into v_existing
    from public.equipment_handouts
   where transfer_source_id = p_handout_id
   limit 1;
  if found then
    if v_existing.tech_id = p_new_tech_id then
      return v_existing.id;
    end if;
    raise exception using errcode = '23505', message = 'Оборудование уже передано другому сотруднику';
  end if;

  if v_source.status <> 'with_tech' then
    raise exception using errcode = '22023', message = 'Передать можно только оборудование, которое сейчас у сотрудника';
  end if;
  if v_source.tech_id = p_new_tech_id then
    raise exception using errcode = '22023', message = 'Выберите другого сотрудника';
  end if;
  if coalesce(v_source.qty, 0) <= 0 then
    raise exception using errcode = '22023', message = 'Количество оборудования должно быть больше нуля';
  end if;
  if not exists (
    select 1 from public.profiles
     where id = p_new_tech_id and coalesce(is_active, true)
  ) then
    raise exception using errcode = '22023', message = 'Новый сотрудник не найден или отключён';
  end if;

  select full_name into v_source_name
    from public.profiles
   where id = v_source.tech_id;

  insert into public.equipment_handouts (
    tech_id, equipment_id, qty, handout_date, status, note,
    created_by, transfer_source_id
  ) values (
    p_new_tech_id, v_source.equipment_id, v_source.qty, current_date, 'with_tech',
    concat('Передано от ', coalesce(nullif(btrim(v_source_name), ''), '?'),
      case when v_note is not null then ' — ' || v_note else '' end),
    auth.uid(), p_handout_id
  ) returning id into v_new_id;

  update public.equipment_handouts
     set status = 'transferred',
         note = coalesce(v_note, note)
   where id = p_handout_id;

  return v_new_id;
end
$function$;

-- Удаление выдач не используется интерфейсом и разрушает историю ответственности.
revoke delete on table public.equipment_handouts from authenticated;
revoke all on function public.transfer_equipment_atomic(uuid, uuid, text) from public, anon;
grant execute on function public.transfer_equipment_atomic(uuid, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select routine_name, security_type from information_schema.routines
-- where routine_schema = 'public' and routine_name = 'transfer_equipment_atomic';
