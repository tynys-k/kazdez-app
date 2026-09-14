-- Apply after the existing 2026-09-12 client directory migration.
-- No stock/payroll opening balances are fabricated by this migration.
begin;

alter table public.tasks add column if not exists assignee_ids uuid[] not null default '{}';
alter table public.tasks add column if not exists observer_ids uuid[] not null default '{}';
alter table public.tasks add column if not exists commenter_ids uuid[] not null default '{}';
alter table public.tasks add column if not exists comment_policy text not null default 'participants'
  check (comment_policy in ('participants','author','selected'));
alter table public.tasks add column if not exists due_time time;

create table if not exists public.legal_contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  number text not null check(length(btrim(number)) between 1 and 200),
  signed_on date not null,
  expires_on date,
  title text not null default '',
  organization text not null default '',
  drive_url text check(drive_url is null or drive_url ~ '^https://(drive|docs)\.google\.com/'),
  amount numeric(16,2) not null default 0 check(amount >= 0),
  status text not null default 'active' check(status in ('draft','active','closed')),
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(expires_on is null or expires_on >= signed_on),
  unique(client_id,number,signed_on)
);
alter table public.service_contracts add column if not exists legal_contract_id uuid references public.legal_contracts(id);

create or replace function public.kd_task_access(p_id text, p_mode text default 'read')
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(public.kd_account_active(),false) and coalesce(exists(select 1 from public.tasks t where t.id::text=p_id and (
    public.kd_has_permission('action.tasks_manage') or t.created_by=auth.uid()
    or (p_mode='read' and (t.assignee_id=auth.uid() or auth.uid()=any(t.assignee_ids) or auth.uid()=any(t.observer_ids)))
    or (p_mode='work' and (t.assignee_id=auth.uid() or auth.uid()=any(t.assignee_ids)))
    or (p_mode='comment' and (t.assignee_id=auth.uid() or auth.uid()=any(t.assignee_ids) or auth.uid()=any(t.observer_ids))
      and (t.comment_policy='participants' or (t.comment_policy='selected' and auth.uid()=any(t.commenter_ids))))
  )),false);
$$;
revoke all on function public.kd_task_access(text,text) from public,anon;
grant execute on function public.kd_task_access(text,text) to authenticated;

-- Replace all task policies: permissive old policies must not bypass membership.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='tasks' loop
    execute format('drop policy %I on public.tasks',p.policyname);
  end loop;
end $$;
alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select to authenticated using(public.kd_task_access(id::text,'read'));
create policy tasks_insert on public.tasks for insert to authenticated with check(public.kd_has_permission('action.tasks_manage') and created_by=auth.uid());
create policy tasks_update on public.tasks for update to authenticated using(public.kd_task_access(id::text,'work')) with check(public.kd_task_access(id::text,'work'));
create policy tasks_delete on public.tasks for delete to authenticated using(public.kd_task_access(id::text,'edit'));

create or replace function public.kd_guard_task_update() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='INSERT' then new.created_by:=auth.uid(); new.created_at:=now();
  else
    if not public.kd_task_access(old.id::text,'edit') and
      (to_jsonb(new)-array['status','done_at','updated_at']) is distinct from (to_jsonb(old)-array['status','done_at','updated_at']) then
      raise exception using errcode='42501',message='Исполнитель может менять только статус задачи';
    end if;
    new.created_by:=old.created_by; new.created_at:=old.created_at;
  end if;
  new.done_at:=case when new.status='done' then case when tg_op='UPDATE' and old.status='done' then old.done_at else now() end else null end;
  return new;
end $$;
drop trigger if exists kd_guard_task_update on public.tasks;
create trigger kd_guard_task_update before insert or update on public.tasks for each row execute function public.kd_guard_task_update();

alter table public.legal_contracts enable row level security;
create policy legal_contracts_read on public.legal_contracts for select to authenticated using(public.kd_has_permission('tab.clients') or public.kd_has_permission('tab.subscriptions') or public.kd_has_permission('tab.docs'));
create policy legal_contracts_insert on public.legal_contracts for insert to authenticated with check((public.kd_has_permission('action.docs_edit') or public.kd_has_permission('action.jobs_edit')) and created_by=auth.uid());
create policy legal_contracts_update on public.legal_contracts for update to authenticated using(public.kd_has_permission('action.docs_edit') or public.kd_has_permission('action.jobs_edit')) with check(public.kd_has_permission('action.docs_edit') or public.kd_has_permission('action.jobs_edit'));
grant select,insert,update on public.legal_contracts to authenticated;

create or replace function public.kd_entity_access(p_kind text,p_id text,p_mode text default 'read')
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select case
    when p_kind='task' then public.kd_task_access(p_id,p_mode)
    when p_kind='contract' then exists(select 1 from public.legal_contracts where id::text=p_id) and
      case when p_mode='read' then public.kd_has_permission('tab.clients') or public.kd_has_permission('tab.subscriptions') or public.kd_has_permission('tab.docs')
      else public.kd_has_permission('action.docs_edit') or public.kd_has_permission('action.jobs_edit') end
    when p_kind='tender' then exists(select 1 from public.tenders where id::text=p_id) and
      public.kd_has_permission(case when p_mode='read' then 'tab.tenders' else 'action.tenders_edit' end)
    else false end;
$$;
revoke all on function public.kd_entity_access(text,text,text) from public,anon;
grant execute on function public.kd_entity_access(text,text,text) to authenticated;

create table public.entity_activity (
  id uuid primary key default gen_random_uuid(), entity_kind text not null check(entity_kind in ('task','contract','tender')),
  entity_id text not null, event_type text not null default 'comment' check(event_type in ('comment','change')),
  body text not null check(length(btrim(body)) between 1 and 8000),
  details jsonb not null default '{}',
  created_by uuid default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
create index entity_activity_parent on public.entity_activity(entity_kind,entity_id,created_at);
alter table public.entity_activity enable row level security;
create policy activity_read on public.entity_activity for select to authenticated using(public.kd_entity_access(entity_kind,entity_id,'read'));
create policy activity_comment on public.entity_activity for insert to authenticated with check(event_type='comment' and created_by=auth.uid() and public.kd_entity_access(entity_kind,entity_id,'comment'));
grant select on public.entity_activity to authenticated;
grant insert(entity_kind,entity_id,event_type,body) on public.entity_activity to authenticated;

create table public.entity_files (
  id uuid primary key default gen_random_uuid(), entity_kind text not null check(entity_kind in ('task','contract','tender')), entity_id text not null,
  storage_path text not null unique, name text not null check(length(name) between 1 and 500), mime_type text not null,
  size_bytes bigint not null check(size_bytes between 1 and 26214400),
  document_kind text not null default 'general' check(document_kind in ('general','contract','avr','invoice')),
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  check(split_part(storage_path,'/',1)=entity_kind and split_part(storage_path,'/',2)=entity_id)
);
alter table public.entity_files enable row level security;
create policy files_read on public.entity_files for select to authenticated using(public.kd_entity_access(entity_kind,entity_id,'read'));
create policy files_insert on public.entity_files for insert to authenticated with check(created_by=auth.uid() and public.kd_entity_access(entity_kind,entity_id,'comment') and exists(select 1 from storage.objects o where o.bucket_id='workflow-files' and o.name=storage_path));
grant select on public.entity_files to authenticated;
grant insert(entity_kind,entity_id,storage_path,name,mime_type,size_bytes,document_kind) on public.entity_files to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('workflow-files','workflow-files',false,26214400,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'])
on conflict(id) do nothing;
create policy workflow_files_read on storage.objects for select to authenticated using(bucket_id='workflow-files' and public.kd_entity_access(split_part(name,'/',1),split_part(name,'/',2),'read'));
create policy workflow_files_upload on storage.objects for insert to authenticated with check(bucket_id='workflow-files' and public.kd_entity_access(split_part(name,'/',1),split_part(name,'/',2),'comment'));

create table public.task_subtasks (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null check(length(btrim(title)) between 1 and 500), assignee_id uuid references auth.users(id),
  due_at timestamptz, done boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
alter table public.task_subtasks enable row level security;
create policy subtasks_read on public.task_subtasks for select to authenticated using(public.kd_task_access(task_id::text,'read'));
create policy subtasks_insert on public.task_subtasks for insert to authenticated with check(public.kd_task_access(task_id::text,'work') and created_by=auth.uid() and (assignee_id is null or exists(select 1 from public.tasks t where t.id=task_subtasks.task_id and (task_subtasks.assignee_id=t.created_by or task_subtasks.assignee_id=t.assignee_id or task_subtasks.assignee_id=any(t.assignee_ids)))));
create policy subtasks_update on public.task_subtasks for update to authenticated using(public.kd_task_access(task_id::text,'work')) with check(public.kd_task_access(task_id::text,'work'));
grant select on public.task_subtasks to authenticated;
grant insert(task_id,title,assignee_id,due_at) on public.task_subtasks to authenticated;
grant update(done) on public.task_subtasks to authenticated;

create or replace function public.kd_workflow_audit() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_kind text; v_id text; v_body text; v_details jsonb;
begin
  if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
  v_details:=jsonb_build_object('after',to_jsonb(new),'before',case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end);
  if tg_table_name='tasks' then v_kind:='task'; v_id:=new.id::text;
    v_body:=case when tg_op='INSERT' then 'Создана задача: ' else 'Изменена задача: ' end || new.title || ' · статус: ' || new.status;
  elsif tg_table_name='task_subtasks' then v_kind:='task'; v_id:=new.task_id::text;
    v_body:=case when tg_op='INSERT' then 'Добавлена подзадача: ' when new.done then 'Выполнена подзадача: ' else 'Возвращена подзадача: ' end || new.title;
  elsif tg_table_name='legal_contracts' then v_kind:='contract'; v_id:=new.id::text;
    v_body:=case when tg_op='INSERT' then 'Создан договор № ' else 'Изменён договор № ' end || new.number;
  elsif tg_table_name='entity_files' then v_kind:=new.entity_kind; v_id:=new.entity_id; v_body:='Прикреплён файл: ' || new.name;
  else v_kind:='tender'; v_id:=new.id::text; v_body:=case when tg_op='INSERT' then 'Создан тендер' else 'Изменены данные тендера' end;
  end if;
  insert into public.entity_activity(entity_kind,entity_id,event_type,body,created_by,details) values(v_kind,v_id,'change',v_body,auth.uid(),v_details);
  return new;
end $$;
create trigger workflow_task_audit after insert or update on public.tasks for each row execute function public.kd_workflow_audit();
create trigger workflow_subtask_audit after insert or update on public.task_subtasks for each row execute function public.kd_workflow_audit();
create trigger workflow_contract_audit after insert or update on public.legal_contracts for each row execute function public.kd_workflow_audit();
create trigger workflow_tender_audit after insert or update on public.tenders for each row execute function public.kd_workflow_audit();
create trigger workflow_file_audit after insert on public.entity_files for each row execute function public.kd_workflow_audit();

-- Append-only call history. The existing per-job result remains the queue key.
create table public.quality_check_events (
  id uuid primary key default gen_random_uuid(), job_id text not null,
  result text not null, rating integer, note text, review_requested boolean, review_url text,
  contacted_at timestamptz, checked_by uuid, created_at timestamptz not null default now()
);
create index quality_check_events_job on public.quality_check_events(job_id,contacted_at);
insert into public.quality_check_events(job_id,result,rating,note,review_requested,review_url,contacted_at,checked_by)
select job_id::text,result,case when result='no_answer' then null else rating end,note,review_requested,review_url,contacted_at,checked_by from public.quality_checks;
alter table public.quality_check_events enable row level security;
create policy quality_events_read on public.quality_check_events for select to authenticated using(public.kd_has_permission('tab.retention') or public.kd_has_permission('tab.clients'));
grant select on public.quality_check_events to authenticated;
create or replace function public.kd_quality_history() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.result='no_answer' then new.rating:=null; end if;
  insert into public.quality_check_events(job_id,result,rating,note,review_requested,review_url,contacted_at,checked_by)
  values(new.job_id::text,new.result,new.rating,new.note,new.review_requested,new.review_url,new.contacted_at,new.checked_by);
  return new;
end $$;
create trigger quality_history before insert or update on public.quality_checks for each row execute function public.kd_quality_history();

revoke all on function public.kd_guard_task_update(),public.kd_workflow_audit(),public.kd_quality_history() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
