import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { workflowFixture } from "./databaseFixture";

const migration = readFileSync(fileURLToPath(new URL("../../supabase/2026-09-16_bank_reconciliation.sql", import.meta.url)), "utf8");
const admin = "10000000-0000-4000-8000-000000000001";
let db;
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(workflowFixture);
  await db.exec(`
    create table public.accounts(id uuid primary key default gen_random_uuid(),name text,kind text,opening_date date,opening_balance numeric);
    create table public.expense_categories(id uuid primary key default gen_random_uuid(),name text,parent_id uuid);
    create table public.opex(id uuid primary key default gen_random_uuid(),category_id uuid,subcategory_id uuid,amount numeric,spent_date date,note text);
    create table public.app_settings(key text primary key,value text);
    alter table public.money_moves add column account_id uuid;
    alter table public.money_moves add column to_account_id uuid;
    alter table public.money_moves add column category_id uuid;
    alter table public.money_moves add column subcategory_id uuid;
    alter table public.money_moves add column note text;
    alter table public.money_moves add column source text;
    alter table public.money_moves add column ref_id uuid;
    alter table public.money_moves add column created_by uuid;
    alter table public.jobs add column report_qr numeric;
  `);
  await db.query("select set_config('test.uid',$1,false),set_config('test.permissions','*',false)", [admin]);
  await db.exec(migration);
}, 60000);
afterAll(async () => db?.close());

describe("bank statement PostgreSQL workflow", () => {
  it("loads rows, matches a manual movement and retains proof after deleting the file", async () => {
    const account = await scalar("insert into accounts(name,kind,opening_date) values('Kaspi Pay','bank','2026-09-01') returning id");
    const move = await scalar("insert into money_moves(account_id,direction,amount,move_date,note,source) values($1,'expense',140000,'2026-09-15','Препараты','manual') returning id", [account]);
    const rows = [
      { booked_on: "2026-09-15", direction: "expense", amount: 140000, description: "Препараты", reference: "BANK-1" },
      { booked_on: "2026-09-15", direction: "expense", amount: 4000, description: "Личная покупка", reference: "BANK-2" },
    ];
    const imported = await scalar("select import_bank_statement($1,$2,'Kaspi Pay','15.xlsx','xlsx',$3::jsonb)", [crypto.randomUUID(), account, JSON.stringify(rows)]);
    expect(imported.imported).toBe(2);
    const statement = imported.statement_id;
    const bankRow = await scalar("select id from bank_transactions where statement_id=$1 and amount=140000", [statement]);
    await db.query("select link_bank_transaction($1,$2)", [bankRow, move]);
    await expect(db.query("delete from money_moves where id=$1", [move])).rejects.toThrow("подтверждено");
    const personalRow = await scalar("select id from bank_transactions where statement_id=$1 and amount=4000", [statement]);
    await db.query("select classify_bank_transaction($1,'owner_direct_spend',null,null,'Личная покупка')", [personalRow]);
    expect(await scalar("select finance_class from money_moves where ref_id=$1", [personalRow])).toBe("owner_direct_spend");
    await db.query("select delete_bank_statement($1)", [statement]);
    expect(await scalar("select count(*)::int from bank_transactions where statement_id=$1", [statement])).toBe(0);
    expect(await scalar("select count(*)::int from bank_evidence where account_id=$1", [account])).toBe(2);
    const reimport = await scalar("select import_bank_statement($1,$2,'Kaspi Pay','17.xlsx','xlsx',$3::jsonb)", [crypto.randomUUID(), account, JSON.stringify(rows)]);
    expect(reimport.imported).toBe(0);
    expect(reimport.duplicates).toBe(2);
  });

  it("posts a previously manual opex expense only once and rejects deleting unresolved rows", async () => {
    const account = await scalar("insert into accounts(name,kind) values('Halyk','bank') returning id");
    const category = await scalar("insert into expense_categories(name) values('Препараты') returning id");
    const opex = await scalar("insert into opex(category_id,amount,spent_date,note) values($1,55000,'2026-09-16','Кельт') returning id", [category]);
    const imported = await scalar("select import_bank_statement($1,$2,'Halyk','16.xlsx','xlsx',$3::jsonb)", [crypto.randomUUID(), account, JSON.stringify([
      { booked_on: "2026-09-16", direction: "expense", amount: 55000, description: "Кельт", reference: "H-1" },
      { booked_on: "2026-09-16", direction: "expense", amount: 1200, description: "Комиссия", reference: "H-2" },
    ])]);
    await expect(db.query("select delete_bank_statement($1)", [imported.statement_id])).rejects.toThrow("Сначала разнесите");
    const row = await scalar("select id from bank_transactions where amount=55000 and statement_id=$1", [imported.statement_id]);
    await db.query("select link_opex_bank_transaction($1,$2)", [row, opex]);
    expect(await scalar("select money_move_id is not null from opex where id=$1", [opex])).toBe(true);
    await expect(db.query("delete from opex where id=$1", [opex])).rejects.toThrow("нельзя менять");
    expect(await scalar("select count(*)::int from money_moves where ref_id=$1", [opex])).toBe(1);
  });
  it("classifies a bank withdrawal to cash as a transfer, not a company expense", async () => {
    const bank = await scalar("insert into accounts(name,kind) values('Bank','bank') returning id");
    const cash = await scalar("insert into accounts(name,kind) values('Наличные','cash') returning id");
    const imported = await scalar("select import_bank_statement($1,$2,'Bank','cash.xlsx','xlsx',$3::jsonb)", [crypto.randomUUID(), bank, JSON.stringify([
      { booked_on: "2026-09-16", direction: "expense", amount: 25000, description: "Снятие наличных", reference: "C-1" },
    ])]);
    const row = await scalar("select id from bank_transactions where statement_id=$1", [imported.statement_id]);
    await db.query("select classify_bank_transaction($1,'transfer',null,$2,'В кассу')", [row, cash]);
    expect(await scalar("select direction from money_moves where ref_id=$1", [row])).toBe("transfer");
    expect(await scalar("select to_account_id from money_moves where ref_id=$1", [row])).toBe(cash);
  });
  it("requires an income channel for a newly classified company receipt", async () => {
    const account = await scalar("insert into accounts(name,kind) values('Business income','bank') returning id");
    const imported = await scalar("select import_bank_statement($1,$2,'Business income','income.xlsx','xlsx',$3::jsonb)", [crypto.randomUUID(), account, JSON.stringify([
      { booked_on: "2026-09-16", direction: "income", amount: 35000, description: "Продажа препарата", reference: "I-1" },
    ])]);
    const row = await scalar("select id from bank_transactions where statement_id=$1", [imported.statement_id]);
    await expect(db.query("select classify_bank_transaction($1,'business',null,null,'Поступление')", [row])).rejects.toThrow("канал дохода");
    await db.query("select classify_bank_transaction($1,'business',null,null,'Поступление',null,'products')", [row]);
    expect(await scalar("select income_channel from money_moves where ref_id=$1", [row])).toBe("products");
  });
  it("confirms QR already represented by a job without posting a second income", async () => {
    const account = await scalar("insert into accounts(name,kind) values('QR','bank') returning id");
    await db.query("insert into app_settings(key,value) values('qr_account_id',$1),('qr_fee_rate','0.95')", [account]);
    const job = await scalar("insert into jobs(status,report_qr) values('done',10000) returning id");
    const imported = await scalar("select import_bank_statement($1,$2,'QR','qr.xlsx','xlsx',$3::jsonb)", [crypto.randomUUID(), account, JSON.stringify([
      { booked_on: "2026-09-16", direction: "income", amount: 9905, description: "QR платёж", reference: "QR-1" },
    ])]);
    const row = await scalar("select id from bank_transactions where statement_id=$1", [imported.statement_id]);
    await db.query("select classify_bank_transaction($1,'qr_job',null,null,'Выписка QR',$2)", [row, job]);
    expect(await scalar("select kind from bank_evidence where transaction_id=$1", [row])).toBe("qr_job");
    expect(await scalar("select count(*)::int from money_moves where ref_id=$1", [row])).toBe(0);
    await expect(db.query("select classify_bank_transaction($1,'qr_job',null,null,'Повтор',$2)", [row, job])).rejects.toThrow("уже разнесена");
  });
  it("requires finance permission even for reads", async () => {
    await db.exec("select set_config('test.permissions','tab.opex',false)");
    await db.exec("set role authenticated");
    try {
      expect(await scalar("select count(*)::int from bank_statements")).toBe(0);
      await expect(db.query("select delete_bank_statement($1)", [crypto.randomUUID()])).rejects.toThrow("Нет доступа");
    } finally {
      await db.exec("reset role");
      await db.exec("select set_config('test.permissions','*',false)");
    }
  });
});
