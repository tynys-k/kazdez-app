import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { PAYROLL_PERIOD_MIGRATION } from "../financialPosting";

// Отдельная мини-схема: проверяем, что миграция периода выплат ложится поверх
// прежних миграций зарплаты, правильно заполняет старые записи и что выплата
// от 1 октября за сентябрь сохраняется с сентябрьским периодом.
const admin = "20000000-0000-4000-8000-000000000001", worker = "20000000-0000-4000-8000-000000000002";
const id = () => crypto.randomUUID();
let db, account;
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const read = (name) => fs.readFileSync(path.join(process.cwd(), "supabase", name), "utf8");

const fixture = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function public.kd_has_permission(p text) returns boolean language sql stable as $$ select auth.uid() is not null $$;
create function public.is_admin() returns boolean language sql stable as $$ select auth.uid() is not null $$;
create function public.kd_account_active() returns boolean language sql stable as $$ select auth.uid() is not null $$;
create function public.kd_books_closed_until() returns date language sql stable as $$ select nullif(current_setting('test.closed_until',true),'')::date $$;
create table public.accounts(id uuid primary key default gen_random_uuid(), name text);
create table public.tech_expenses(id uuid primary key default gen_random_uuid(), tech_id uuid, type text default 'salary', amount numeric default 0, expense_date date, note text, status text default 'unpaid', created_by uuid, created_at timestamptz default now(), account_id uuid references public.accounts(id), paid_at date);
create table public.money_moves(id uuid primary key default gen_random_uuid(), account_id uuid, direction text, amount numeric, move_date date, note text, source text, ref_id uuid, created_by uuid, created_at timestamptz default now());
-- Упрощённый аналог kd_enforce_open_period: любая правка в закрытом периоде запрещена.
create function public.kd_test_closed() returns trigger language plpgsql as $$
begin
  if public.kd_books_closed_until() is not null and coalesce(new.expense_date, old.expense_date) <= public.kd_books_closed_until() then
    raise exception 'Период закрыт';
  end if;
  return new;
end $$;
create trigger kd_closed_period_tech_expenses before update on public.tech_expenses for each row execute function public.kd_test_closed();
`;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(fixture);
  for (const user of [admin, worker]) await db.query("insert into auth.users values($1)", [user]);
  await db.query("select set_config('test.uid',$1,false)", [admin]);
  for (const name of ["2026-09-08_atomic_payroll.sql", "2026-09-14_payroll_carryover.sql"]) {
    try { await db.exec(read(name)); } catch (e) { throw new Error(`${name}: ${e.message}`); }
  }
  account = await scalar("insert into accounts(name) values('Kaspi Gold') returning id");
  // Записи до миграции: месяц только в заметке.
  const legacy = [
    ["2026-07-05", "Зарплата за Июнь"], ["2026-08-31", "За август"], ["2026-10-01", "Сентябрь"],
    ["2026-09-30", "Сентябрь / Октябрь"], ["2026-09-25", "Сентябрь (Налоги)"], ["2026-09-09", null], ["2026-09-12", "Апрель"],
  ];
  for (const [date, note] of legacy) {
    await db.query("insert into tech_expenses(tech_id,type,amount,expense_date,note,status) values($1,'salary',1000,$2,$3,'paid')", [worker, date, note]);
  }
  // Старые месяцы закрыты — бэкфилл всё равно должен пройти.
  await db.query("select set_config('test.closed_until','2026-08-31',false)");
  try { await db.exec(read(PAYROLL_PERIOD_MIGRATION)); } catch (e) { throw new Error(`${PAYROLL_PERIOD_MIGRATION}: ${e.message}`); }
}, 60000);
afterAll(async () => { await db?.close(); });

describe("payroll payment period migration", () => {
  it("backfills the period from an unambiguous month in the note, else from the date", async () => {
    const rows = (await db.query("select to_char(expense_date,'YYYY-MM-DD') d, note, period_month from tech_expenses order by expense_date, note")).rows;
    const byNote = Object.fromEntries(rows.map((r) => [r.note ?? `(пусто ${r.d})`, r.period_month]));
    expect(byNote["Зарплата за Июнь"]).toBe("2026-06");
    expect(byNote["За август"]).toBe("2026-08");
    expect(byNote["Сентябрь"]).toBe("2026-09");
    expect(byNote["Сентябрь / Октябрь"]).toBe("2026-09");
    expect(byNote["Сентябрь (Налоги)"]).toBe("2026-09");
    expect(byNote["(пусто 2026-09-09)"]).toBe("2026-09");
    // Апрель при оплате в сентябре — слишком далеко, это не период.
    expect(byNote["Апрель"]).toBe("2026-09");
  });

  it("re-enables the closed-period trigger after the backfill", async () => {
    await expect(db.query("update tech_expenses set note='x' where note='За август'")).rejects.toThrow("Период закрыт");
  });

  it("posts a 1 October payment into September with its own kind", async () => {
    const request = id();
    const args = [request, worker, "advance", 150000, "2026-10-01", account, "Kaspi Gold", null, "2026-09"];
    const sql = "select post_payroll_payment_atomic($1,$2,$3,$4,$5,$6,$7,$8,$9)";
    const expense = await scalar(sql, args);
    expect(await scalar(sql, args)).toBe(expense);
    const row = (await db.query("select type, period_month, to_char(expense_date,'YYYY-MM-DD') d from tech_expenses where id=$1", [expense])).rows[0];
    expect(row).toEqual({ type: "advance", period_month: "2026-09", d: "2026-10-01" });
    expect(await scalar("select count(*)::int from money_moves where ref_id=$1 and move_date='2026-10-01'", [expense])).toBe(1);
    await expect(db.query(sql, [request, worker, "advance", 150000, "2026-10-01", account, "Kaspi Gold", null, "2026-10"])).rejects.toThrow("другими данными");
  });

  it("keeps the old signature working with the payment month as the period", async () => {
    const expense = await scalar("select post_payroll_payment_atomic($1,$2,'salary',5000,'2026-10-03',$3,null,null)", [id(), worker, account]);
    expect(await scalar("select period_month from tech_expenses where id=$1", [expense])).toBe("2026-10");
  });

  it("rejects malformed periods and unknown kinds", async () => {
    await expect(db.query("select post_payroll_payment_atomic($1,$2,'salary',1,'2026-10-03',$3,null,null,'2026-9')", [id(), worker, account])).rejects.toThrow("ГГГГ-ММ");
    await expect(db.query("select post_payroll_payment_atomic($1,$2,'gift',1,'2026-10-03',$3,null,null,'2026-09')", [id(), worker, account])).rejects.toThrow("Некорректные");
  });

  it("carries an overpayment from the payment period, not the payment date", async () => {
    const expense = await scalar("select post_payroll_payment_atomic($1,$2,'salary',100000,'2026-10-02',$3,null,null,'2026-09')", [id(), worker, account]);
    await db.query("select carry_payroll_overpayment($1,$2,'2026-10',4000,'Переплата за сентябрь')", [id(), expense]);
    expect(await scalar("select from_month from payroll_carryovers where payment_id=$1", [expense])).toBe("2026-09");
    await expect(db.query("update tech_expenses set period_month='2026-08' where id=$1", [expense])).rejects.toThrow("перенос");
  });
});
