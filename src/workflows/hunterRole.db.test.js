import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { HUNTER_FUNNEL_MIGRATION, HUNTER_PROPOSALS_MIGRATION, HUNTER_ROLE_MIGRATION } from "./hunterFunnelModel";

// Проверяем доступ так же, как его видит приложение: под ролью authenticated
// с включённым RLS и теми же «разрешающими» политиками, что в живой базе.
const admin = "50000000-0000-4000-8000-000000000001";
const hunter = "50000000-0000-4000-8000-000000000002";
const otherHunter = "50000000-0000-4000-8000-000000000003";
const manager = "50000000-0000-4000-8000-000000000004";
let db;
const read = (name) => fs.readFileSync(path.join(process.cwd(), "supabase", name), "utf8");
const as = async (uid) => { await db.exec("reset role"); await db.query("select set_config('test.uid',$1,false)", [uid]); await db.exec("set role authenticated"); };
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;

const fixture = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table public.profiles(id uuid primary key, full_name text, role text, is_active boolean default true, access_overrides jsonb default '{}', branch_id uuid,
  constraint profiles_role_kazdez_check check (role = any (array['admin','tech','manager','marketer','accountant','tender','curator'])));
create function public.is_admin() returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;
create function public.kd_account_active() returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles where id = auth.uid() and is_active) $$;
create function public.kd_has_role(allowed text[]) returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role = any(allowed)) $$;
create function public.kd_has_permission(permission_key text) returns boolean language sql stable security definer as $$ select public.is_admin() $$;
create function public.kd_phone_key(text) returns text language sql immutable as $$ select right(regexp_replace($1,'[^0-9]','','g'),10) $$;
create table public.branches(id uuid primary key default gen_random_uuid(), is_default boolean, created_at timestamptz default now());
create table public.clients(id uuid primary key default gen_random_uuid(), phone_key text not null unique, phone text, name text, client_type text default 'person', legal_name text, bin_iin text, updated_at timestamptz);
create table public.lead_stages(id uuid primary key default gen_random_uuid(), name text, sort int, is_final boolean default false, is_lost boolean default false, created_at timestamptz default now());
create table public.leads(id uuid primary key default gen_random_uuid(), name text, client_type text default 'person', phone text, address text, source text,
  stage_id uuid references public.lead_stages(id), kp_url text, note text, converted_job_id uuid, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.orders(id uuid primary key default gen_random_uuid(), address text, client_phone text, contact_name text, branch_id uuid, status text, opened_on date, created_by uuid, root_job_id uuid);
create table public.jobs(id uuid primary key default gen_random_uuid(), type text, scheduled_date date, address text, area numeric, source text, client_phone text, brand text,
  guarantee_months int, pest text, price_options jsonb, note text, created_by uuid, branch_id uuid, order_id uuid, visit_no int, visit_kind text, work_stage text, status text default 'new');
create table public.proposals(id uuid primary key default gen_random_uuid(), lead_id uuid, author_id uuid, number text);
insert into public.lead_stages(name, sort) values ('Новый лид',10),('Связались',20),('КП выдано',30),('Договор',40);
insert into public.lead_stages(name, sort, is_final) values ('Готов к выезду',50,true);
insert into public.lead_stages(name, sort, is_final, is_lost) values ('Отказ',60,true,true);
`;
// Разрешающие политики из живой базы: любая из них открыла бы хантеру все лиды.
const livePolicies = `
alter table public.leads enable row level security;
alter table public.lead_stages enable row level security;
alter table public.clients enable row level security;
create policy kd_module_guard on public.leads for all using (public.kd_account_active() and public.kd_has_permission('tab.leads')) with check (public.kd_account_active() and public.kd_has_permission('tab.leads'));
create policy leads_all on public.leads for all using (public.kd_has_role(array['admin','manager'])) with check (public.kd_has_role(array['admin','manager']));
create policy kd_module_guard on public.lead_stages for all using (public.kd_account_active() and public.kd_has_permission('tab.leads')) with check (public.kd_account_active() and public.kd_has_permission('tab.leads'));
alter table public.proposals enable row level security;
create policy "proposals select" on public.proposals for select using (public.is_admin() or public.kd_has_permission('tab.proposals'));
create policy "proposals update" on public.proposals for update using (public.is_admin() or public.kd_has_permission('tab.proposals')) with check (public.is_admin() or public.kd_has_permission('tab.proposals'));
create policy "clients select" on public.clients for select using (public.is_admin() or public.kd_has_permission('action.jobs_edit'));
create policy "clients write" on public.clients for all using (public.is_admin() or public.kd_has_permission('action.jobs_edit')) with check (public.is_admin() or public.kd_has_permission('action.jobs_edit'));
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.leads, public.lead_stages, public.clients, public.lead_activities, public.profiles, public.proposals, public.jobs to authenticated;
`;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(fixture);
  for (const [id, role] of [[admin, "admin"], [hunter, "tech"], [otherHunter, "tech"], [manager, "manager"]]) {
    await db.query("insert into auth.users values($1)", [id]);
    await db.query("insert into profiles(id, full_name, role) values($1,$2,$3)", [id, role, role]);
  }
  await db.query("select set_config('test.uid',$1,false)", [admin]);
  for (const name of ["2026-09-09_lead_work_queue.sql", "2026-09-09_lead_activity_timeline.sql", "2026-09-08_atomic_lead_conversion.sql", HUNTER_FUNNEL_MIGRATION]) {
    try { await db.exec(read(name)); } catch (e) { throw new Error(`${name}: ${e.message}`); }
  }
  await db.exec(livePolicies);
  for (const name of [HUNTER_ROLE_MIGRATION, HUNTER_PROPOSALS_MIGRATION]) {
    try { await db.exec(read(name)); } catch (e) { throw new Error(`${name}: ${e.message}`); }
  }
  await db.query("update profiles set role='hunter' where id = any($1)", [[hunter, otherHunter]]);
  const stageNew = (await rows("select id from lead_stages where code='new'"))[0].id;
  for (const [name, owner] of [["Кафе хантера", hunter], ["Склад другого хантера", otherHunter], ["Лид менеджера", manager]]) {
    await db.query("insert into leads(name, client_type, stage_id, owner_id, created_by) values($1,'company',$2,$3,$3)", [name, stageNew, owner]);
  }
}, 60000);
afterAll(async () => { await db?.close(); });

describe("роль «Хантер»", () => {
  it("даёт хантеру только вкладку лидов", async () => {
    await as(hunter);
    const [perm] = await rows("select kd_has_permission('tab.leads') leads, kd_has_permission('tab.jobs') jobs, kd_has_permission('tab.today') today");
    expect(perm).toEqual({ leads: true, jobs: false, today: false });
  });

  it("хантер видит и меняет только свои сделки", async () => {
    await as(hunter);
    expect((await rows("select name from leads order by name")).map((r) => r.name)).toEqual(["Кафе хантера"]);
    const touched = await db.query("update leads set note='чужое' where name='Склад другого хантера'");
    expect(touched.affectedRows).toBe(0);
    await expect(db.query("update leads set owner_id=$1 where name='Кафе хантера'", [manager])).rejects.toThrow(/row-level security/);
    await expect(db.query("insert into leads(name, owner_id) values('Чужой', $1)", [otherHunter])).rejects.toThrow(/row-level security/);
    await db.query("insert into leads(name, client_type, owner_id) values('Новый объект', 'company', $1)", [hunter]);
    expect((await db.query("delete from leads where name='Новый объект'")).affectedRows).toBe(0);
  });

  it("менеджер и админ по-прежнему видят всю воронку", async () => {
    await as(manager);
    expect((await rows("select count(*)::int n from leads"))[0].n).toBe(4);
    await as(admin);
    expect((await rows("select count(*)::int n from leads"))[0].n).toBe(4);
  });

  it("хантер не меняет стадии воронки", async () => {
    await as(hunter);
    expect((await rows("select count(*)::int n from lead_stages"))[0].n).toBe(9);
    await expect(db.query("insert into lead_stages(name, sort) values('Своя', 200)")).rejects.toThrow(/row-level security/);
    expect((await db.query("update lead_stages set name='x' where code='new'")).affectedRows).toBe(0);
  });

  it("касания и заявка — только по своим сделкам, история видна только своя", async () => {
    await as(hunter);
    const [own] = await rows("select id from leads where name='Кафе хантера'");
    await db.query("select record_lead_activity_atomic($1,'call','connected','Говорил с управляющим',now(),'Отправить КП',now()+interval '1 day')", [own.id]);
    await as(otherHunter);
    await expect(db.query("select record_lead_activity_atomic($1,'call','connected','Влез',now(),'x',now()+interval '1 day')", [own.id])).rejects.toThrow(/другого сотрудника/);
    await expect(db.query("select touch_lead_atomic($1,'x',now()+interval '1 day')", [own.id])).rejects.toThrow(/другого сотрудника/);
    await expect(db.query("select convert_lead_to_job_atomic($1, 6)", [own.id])).rejects.toThrow(/другого сотрудника/);
    expect((await rows("select count(*)::int n from lead_activities where lead_id=$1", [own.id]))[0].n).toBe(0);
    await as(hunter);
    expect((await rows("select comment from lead_activities where lead_id=$1 and kind='call'", [own.id]))[0].comment).toBe("Говорил с управляющим");
  });

  it("хантер заводит юрлицо из сделки и видит только юрлица своих сделок", async () => {
    await as(admin);
    await db.query("insert into clients(phone_key, phone, name, client_type) values('7015550000','+7 701 555 0000','Чужой клиент','person')");
    await as(hunter);
    const [own] = await rows("select id from leads where name='Кафе хантера'");
    await expect(db.query("select create_lead_company($1,'ТОО Кафе','123',null)", [own.id])).rejects.toThrow(/БИН/);
    const [{ create_lead_company: companyId }] = await rows("select create_lead_company($1,'ТОО «Кафе»','120 340 005 678','+7 727 300 11 22')", [own.id]);
    expect((await rows("select company_id from leads where id=$1", [own.id]))[0].company_id).toBe(companyId);
    expect((await rows("select legal_name from clients")).map((r) => r.legal_name)).toEqual(["ТОО «Кафе»"]);
    // Повтор с тем же БИН не плодит дубль.
    const [{ create_lead_company: again }] = await rows("select create_lead_company($1,'ТОО Кафе','120340005678','+7 727 300 11 22')", [own.id]);
    expect(again).toBe(companyId);
  });
  it("с доступом «КП» хантер видит только свои КП и КП по своим сделкам", async () => {
    await as(admin);
    const [own] = await rows("select id from leads where name='Кафе хантера'");
    const [foreign] = await rows("select id from leads where name='Лид менеджера'");
    // КП в живой базе создаёт только create_proposal (security definer) — сеем в обход RLS.
    await db.exec("reset role");
    await db.query("insert into proposals(number, author_id) values('КП-хантера', $1), ('КП-менеджера', $2)", [hunter, manager]);
    await db.query("insert into proposals(number, author_id, lead_id) values('КП-по-сделке-хантера', $1, $2), ('КП-по-чужой-сделке', $1, $3)", [manager, own.id, foreign.id]);
    await as(hunter);
    expect((await rows("select count(*)::int n from proposals"))[0].n).toBe(0);
    await as(admin);
    await db.query("update profiles set access_overrides=$2::jsonb where id=$1", [hunter, JSON.stringify({ "tab.proposals": true })]);
    await as(hunter);
    expect((await rows("select number from proposals order by number")).map((r) => r.number)).toEqual(["КП-по-сделке-хантера", "КП-хантера"]);
    expect((await db.query("update proposals set number=number where number='КП-менеджера'")).affectedRows).toBe(0);
    await as(manager);
    expect((await rows("select count(*)::int n from proposals"))[0].n).toBe(0);
    await as(admin);
    expect((await rows("select count(*)::int n from proposals"))[0].n).toBe(4);
  });
});
