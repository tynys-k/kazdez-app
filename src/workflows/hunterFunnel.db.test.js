import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { HUNTER_FUNNEL_MIGRATION } from "./hunterFunnelModel";

// Мини-схема CRM в форме живой базы: старые стадии, лиды, заявки. Поверх —
// прежние миграции очереди, истории и конвертации, затем воронка Хантера.
const admin = "30000000-0000-4000-8000-000000000001";
let db;
const read = (name) => fs.readFileSync(path.join(process.cwd(), "supabase", name), "utf8");
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const stage = async (code) => (await one("select id from lead_stages where code=$1", [code])).id;
const move = (leadId, code) => db.query("update leads set stage_id=(select id from lead_stages where code=$2) where id=$1", [leadId, code]);

const fixture = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function public.is_admin() returns boolean language sql stable as $$ select auth.uid() is not null $$;
create function public.kd_account_active() returns boolean language sql stable as $$ select auth.uid() is not null $$;
create function public.kd_has_role(text[]) returns boolean language sql stable as $$ select auth.uid() is not null $$;
create table public.profiles(id uuid primary key, full_name text, branch_id uuid);
create table public.branches(id uuid primary key default gen_random_uuid(), is_default boolean, created_at timestamptz default now());
create table public.clients(id uuid primary key default gen_random_uuid(), name text, client_type text);
create table public.lead_stages(id uuid primary key default gen_random_uuid(), name text, sort int, is_final boolean default false, is_lost boolean default false, created_at timestamptz default now());
create table public.leads(id uuid primary key default gen_random_uuid(), name text, client_type text default 'person', phone text, address text, source text,
  stage_id uuid references public.lead_stages(id), kp_url text, note text, converted_job_id uuid, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.orders(id uuid primary key default gen_random_uuid(), address text, client_phone text, contact_name text, branch_id uuid, status text, opened_on date, created_by uuid, root_job_id uuid);
create table public.jobs(id uuid primary key default gen_random_uuid(), type text, scheduled_date date, address text, area numeric, source text, client_phone text, brand text,
  guarantee_months int, pest text, price_options jsonb, note text, created_by uuid, branch_id uuid, order_id uuid, visit_no int, visit_kind text, work_stage text, status text default 'new');
create table public.proposals(id uuid primary key default gen_random_uuid(), lead_id uuid);
insert into public.lead_stages(name, sort, is_final, is_lost) values
  ('Новый лид',10,false,false),('Связались',20,false,false),('КП выдано',30,false,false),
  ('Договор',40,false,false),('Готов к выезду',50,true,false),('Отказ',60,true,true);
`;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(fixture);
  await db.query("insert into auth.users values($1)", [admin]);
  await db.query("insert into profiles(id, full_name) values($1,'Хантер')", [admin]);
  await db.query("select set_config('test.uid',$1,false)", [admin]);
  // Старый лид, уже превращённый в заявку на финальной стадии.
  await db.exec(`insert into jobs(id, status) values('40000000-0000-4000-8000-000000000001','done');
    insert into leads(name, stage_id, converted_job_id) select 'Старый', id, '40000000-0000-4000-8000-000000000001' from lead_stages where name='Готов к выезду';`);
  for (const name of ["2026-09-09_lead_work_queue.sql", "2026-09-09_lead_activity_timeline.sql", "2026-09-08_atomic_lead_conversion.sql", HUNTER_FUNNEL_MIGRATION]) {
    try { await db.exec(read(name)); } catch (e) { throw new Error(`${name}: ${e.message}`); }
  }
}, 60000);
afterAll(async () => { await db?.close(); });

describe("миграция воронки Хантера", () => {
  it("даёт девять стадий с кодами, сохраняя старые записи", async () => {
    const rows = (await db.query("select code, name, is_final, is_lost from lead_stages order by sort")).rows;
    expect(rows.map((r) => r.code)).toEqual(["new", "lpr_found", "kp_sent", "negotiation", "contract", "first_service", "subscriber", "lost", "snoozed"]);
    expect(rows.find((r) => r.code === "first_service").is_final).toBe(false);
    expect(rows.find((r) => r.code === "subscriber").is_final).toBe(true);
    expect(Number((await one("select count(*) n from lead_stages")).n)).toBe(9);
  });

  it("возвращает в работу сделки, которые уже стали заявкой", async () => {
    const lead = await one("select l.next_action, s.code from leads l join lead_stages s on s.id=l.stage_id where l.name='Старый'");
    expect(lead.code).toBe("first_service");
    expect(lead.next_action).toMatch(/абонент, отложено или отказ/);
  });

  it("не пускает юрлицо вперёд без полей и называет, чего не хватает", async () => {
    const { id } = await one("insert into leads(name, client_type, stage_id) values('Кафе', 'company', $1) returning id", [await stage("new")]);
    await expect(move(id, "lpr_found")).rejects.toThrow(/«ЛПР найден»: не заполнено — тип объекта, адрес объекта, площадь/);
    await db.query("update leads set object_type='catering', address='Абая 1', area_m2=80 where id=$1", [id]);
    await move(id, "lpr_found");
    await expect(move(id, "negotiation")).rejects.toThrow(/ФИО ЛПР.*КП/);
    await db.query(`update leads set lpr_name='Аскар', lpr_phone='+7 701 111 22 33', pests='{Тараканы}', current_provider='нет',
      desired_frequency='monthly' where id=$1`, [id]);
    await db.query("insert into proposals(lead_id) values($1)", [id]);
    await move(id, "negotiation");
    // Назад — без проверок.
    await move(id, "new");
    expect((await one("select s.code from leads l join lead_stages s on s.id=l.stage_id where l.id=$1", [id])).code).toBe("new");
  });

  it("физлицо двигается свободно, но отказ требует причину", async () => {
    const { id } = await one("insert into leads(name, stage_id) values('Иван', $1) returning id", [await stage("new")]);
    await move(id, "contract");
    await expect(move(id, "lost")).rejects.toThrow(/причина отказа/);
    await db.query("update leads set lost_reason='price', stage_id=(select id from lead_stages where code='lost') where id=$1", [id]);
    expect((await one("select next_action from leads where id=$1", [id])).next_action).toBeNull();
  });

  it("«Отложено» ставит возврат в очередь на дату возврата", async () => {
    const { id } = await one("insert into leads(name, stage_id) values('Склад', $1) returning id", [await stage("new")]);
    await db.query("update leads set snooze_until='2027-03-01', snooze_reason='бюджет весной', stage_id=(select id from lead_stages where code='snoozed') where id=$1", [id]);
    const lead = await one("select next_action, (next_action_at at time zone 'Asia/Almaty')::date d from leads where id=$1", [id]);
    expect(lead.next_action).toBe("Вернуться к клиенту: бюджет весной");
    expect(String(lead.d.toISOString?.() ?? lead.d)).toMatch(/2027-0(2-28|3-01)/);
  });

  it("заявка из лида ставит сделку на «Первую обработку», а юрлицу без договора отказывает", async () => {
    const person = await one("insert into leads(name, phone, stage_id) values('Пётр', '+7 700 000 00 00', $1) returning id", [await stage("kp_sent")]);
    await db.query("select convert_lead_to_job_atomic($1, 6)", [person.id]);
    expect((await one("select s.code, l.next_action from leads l join lead_stages s on s.id=l.stage_id where l.id=$1", [person.id])).code).toBe("first_service");
    // Сделка с заявкой продолжает принимать касания.
    await db.query("select record_lead_activity_atomic($1,'call','connected','Договорились о выезде',now(),'Проверить акт',now()+interval '1 day')", [person.id]);

    const company = await one("insert into leads(name, client_type, stage_id) values('ТОО Склад', 'company', $1) returning id", [await stage("new")]);
    await expect(db.query("select convert_lead_to_job_atomic($1, 6)", [company.id])).rejects.toThrow(/«Первая обработка»: не заполнено/);
    expect(Number((await one("select count(*) n from jobs where origin_lead_id=$1", [company.id])).n)).toBe(0);
  });

  it("«Абонент» требует выполненную заявку и дату следующего выезда", async () => {
    const { id: clientId } = await one("insert into clients(name, client_type) values('ТОО Ресторан','company') returning id");
    const { id } = await one(`insert into leads(name, client_type, stage_id, object_type, address, area_m2, lpr_name, lpr_phone, pests, current_provider,
      desired_frequency, kp_url, quoted_price, agreed_frequency, expected_mrr, company_id, signer_name, first_service_at)
      values('Ресторан','company',$1,'catering','Абая 2',200,'Ержан','+77011112233','{Мыши}','нет','monthly','https://kp',40000,'monthly',40000,$2,'Директор','2026-10-25') returning id`,
    [await stage("contract"), clientId]);
    const { convert_lead_to_job_atomic: jobId } = await one("select convert_lead_to_job_atomic($1, 6)", [id]);
    expect((await one("select scheduled_date::text d, area from jobs where id=$1", [jobId])).d).toBe("2026-10-25");
    await db.query("update leads set contract_signed_at='2026-10-20', keeper_id=$2 where id=$1", [id, admin]);
    await expect(move(id, "subscriber")).rejects.toThrow(/закрытый акт.*следующего регулярного выезда/);
    await db.query("update jobs set status='done' where id=$1", [jobId]);
    await db.query("update leads set next_service_at='2026-11-25' where id=$1", [id]);
    await move(id, "subscriber");
    expect((await one("select next_action from leads where id=$1", [id])).next_action).toBeNull();
  });
});
