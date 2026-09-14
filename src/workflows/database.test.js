import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { workflowFixture } from "./databaseFixture";
const admin = "10000000-0000-4000-8000-000000000001", worker = "10000000-0000-4000-8000-000000000002", observer = "10000000-0000-4000-8000-000000000003", outsider = "10000000-0000-4000-8000-000000000004";
const id = () => crypto.randomUUID();
let db;
async function actor(user = admin, permissions = "*") {
  await db.query("select set_config('test.uid',$1,false),set_config('test.permissions',$2,false)", [user, permissions]);
}
async function scalar(sql, params = []) { return Object.values((await db.query(sql, params)).rows[0])[0]; }
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(workflowFixture);
  for (const user of [admin, worker, observer, outsider]) { await db.query("insert into auth.users values($1)", [user]); await db.query("insert into profiles(id) values($1)", [user]); }
  await actor();
  for (const name of ["2026-09-08_atomic_stock_receipts.sql", "2026-09-08_atomic_equipment_transfers.sql", "2026-09-09_fix_quality_check_job_id.sql", "2026-09-14_connected_workflows.sql", "2026-09-14_job_object_measurements.sql", "2026-09-14_client_relationships.sql", "2026-09-14_multiwarehouse.sql", "2026-09-14_employee_stock.sql", "2026-09-14_payroll_carryover.sql", "2026-09-14_tender_workflows.sql", "2026-09-14_tender_deliveries.sql"]) {
    try { await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase", name), "utf8")); }
    catch (e) { throw new Error(`${name}: ${e.message}`); }
  }
}, 60000);
afterAll(async () => { await db?.close(); });

describe("PostgreSQL workflow transactions", () => {
  it("persists object measurements through atomic job creation", async () => {
    await actor(); await db.exec("insert into branches(is_default) values(true)");
    const jobId = await scalar("select create_job_atomic($1,$2)", [id(), { address: "Абая 10", pest: "Фумигация", client_phone: "+77010000000", type: "Первичная", pricing_mode: "on_site_estimate", object_kind: "commercial", object_details: { measurement: "fumigation", volume_m3: 60 } }]);
    expect(await scalar("select object_details->>'volume_m3' from jobs where id=$1", [jobId])).toBe("60");
  });
  it("gives observers read access without letting them change task fields", async () => {
    await actor(); const task = await scalar("insert into tasks(title,assignee_id,observer_ids,comment_policy) values('Проверить',$1,$2,'author') returning id", [worker, [observer]]);
    await actor(observer, "tab.tasks"); await db.exec("set role authenticated");
    expect(await scalar("select count(*)::int from tasks where id=$1", [task])).toBe(1);
    await expect(db.query("insert into entity_activity(entity_kind,entity_id,body) values('task',$1,'Комментарий')", [task])).rejects.toThrow();
    await actor(worker, "tab.tasks");
    await expect(db.query("update tasks set title='Подмена' where id=$1", [task])).rejects.toThrow("только статус");
    await db.query("update tasks set status='in_progress' where id=$1", [task]);
    await actor(outsider, "tab.tasks"); expect(await scalar("select count(*)::int from tasks where id=$1", [task])).toBe(0);
    await db.exec("reset role"); await actor();
  });
  it("keeps every quality call while maintaining one queue result per visit", async () => {
    await actor(); const job = await scalar("insert into jobs(client_phone) values('+77010000000') returning id");
    await db.query("select save_quality_check_atomic($1,$2)", [job, { result: "positive", rating: 5, note: "Всё хорошо" }]);
    await db.query("select save_quality_check_atomic($1,$2)", [job, { result: "no_answer", rating: 5, note: "Второй звонок" }]);
    expect(await scalar("select count(*)::int from quality_check_events where job_id=$1", [job])).toBe(2);
    expect(await scalar("select count(*)::int from quality_checks where job_id=$1", [job])).toBe(1);
    expect(await scalar("select rating from quality_checks where job_id=$1", [job])).toBeNull();
  });
  it("rejects an outsider assigned to a subtask and records changed fields", async () => {
    await actor(); const task = await scalar("insert into tasks(title,assignee_id) values('Сверка',$1) returning id", [worker]);
    await actor(worker, "tab.tasks"); await db.exec("set role authenticated");
    try {
      await expect(db.query("insert into task_subtasks(task_id,title,assignee_id) values($1,'Чужому',$2)", [task, outsider])).rejects.toThrow();
      await db.query("insert into task_subtasks(task_id,title,assignee_id) values($1,'Сверить',$2)", [task, worker]);
      await db.query("update tasks set status='done',done_at='2000-01-01' where id=$1", [task]);
      expect(await scalar("select done_at>'2020-01-01' from tasks where id=$1", [task])).toBe(true);
      expect(await scalar("select count(*)::int from entity_activity where entity_id=$1 and details->'before'->>'status'='new' and details->'after'->>'status'='done'", [task])).toBe(1);
    } finally { await db.exec("reset role"); await actor(); }
  });
  it("preserves warehouse origin through equipment transfer and returns only once", async () => {
    await actor(); const item = await scalar("insert into equipment(name) values('Опрыскиватель') returning id");
    const warehouse = await scalar("select id from stock_warehouses where name='Мамыр-4'");
    await db.query("select post_warehouse_operation($1,'receipt','equipment',$2,null,$3,null,2,'Закупка',null)", [id(), item, warehouse]);
    await db.query("select post_warehouse_operation($1,'issue','equipment',$2,$3,null,$4,1,'Выдача',null)", [id(), item, warehouse, worker]);
    const source = await scalar("select id from equipment_handouts where equipment_id=$1", [item]);
    const next = await scalar("select transfer_equipment_atomic($1,$2,'Смена бригады')", [source, observer]);
    expect(await scalar("select warehouse_id from equipment_handouts where id=$1", [next])).toBe(warehouse);
    await db.query("update equipment_handouts set status='returned' where id=$1", [next]);
    await db.query("update equipment_handouts set status='returned' where id=$1", [next]);
    expect(Number(await scalar("select kd_warehouse_balance('equipment',$1,$2)", [item, warehouse]))).toBe(2);
    await expect(db.query("update equipment_handouts set status='with_tech' where id=$1", [next])).rejects.toThrow("Возврат уже проведён");
  });
  it("deducts tender deliveries once without creating a fictitious sale", async () => {
    await actor(); const chem = await scalar("insert into chemicals(name,purchased_ml,unit_kind) values('Тендерный препарат',1000,'volume') returning id");
    const tender = await scalar("insert into tenders(title) values('Поставка') returning id");
    const warehouse = await scalar("select id from stock_warehouses where unallocated");
    const args = [id(), tender, chem, warehouse, 250, "АВР 15"];
    await db.query("select deliver_tender_chemical($1,$2,$3,$4,$5,$6)", args);
    await db.query("select deliver_tender_chemical($1,$2,$3,$4,$5,$6)", args);
    expect(Number(await scalar("select kd_warehouse_balance('chemical',$1,$2)", [chem, warehouse]))).toBe(750);
    expect(await scalar("select count(*)::int from chemical_sales where chemical_id=$1", [chem])).toBe(0);
    expect(await scalar("select count(*)::int from tender_deliveries where tender_id=$1", [tender])).toBe(1);
  });
  it("saves customer labels and rejects a contract belonging to another client", async () => {
    await actor(); const client = await scalar("select save_client_profile_atomic(null,$1)", [{ phone: "+77014444444", name: "Тест", client_labels: ["vip", "government"] }]);
    expect(await scalar("select client_labels from clients where id=$1", [client])).toEqual(["vip", "government"]);
    const contract = await scalar("insert into legal_contracts(client_id,number,signed_on) values($1,'Д-1','2026-09-14') returning id", [client]);
    await expect(db.query("insert into service_contracts(legal_contract_id) values($1)", [contract])).rejects.toThrow("принадлежать");
    await db.query("insert into service_contracts(client_id,legal_contract_id) values($1,$2)", [client, contract]);
  });
  it("posts a located receipt once, moves stock and refuses an overspend", async () => {
    await actor(); const chem = await scalar("insert into chemicals(name,unit_kind,purchased_ml) values('Тест','volume',0) returning id");
    const warehouse = await scalar("select id from stock_warehouses where name='Байзакова'");
    const args = [id(), chem, 1000, 17000, "2026-09-14", "Поставщик", null, null, warehouse];
    await db.query("select post_located_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9)", args); await db.query("select post_located_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9)", args);
    expect(Number(await scalar("select purchased_ml from chemicals where id=$1", [chem]))).toBe(1000);
    const issue = [id(), "issue", "chemical", chem, warehouse, null, worker, 200, "Выдача", null];
    await db.query("select post_warehouse_operation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", issue);
    expect(Number(await scalar("select kd_warehouse_balance('chemical',$1,$2)", [chem, warehouse]))).toBe(800);
    await expect(db.query("select post_warehouse_operation($1,'issue','chemical',$2,$3,null,$4,900,'Ошибка',null)", [id(), chem, warehouse, worker])).rejects.toThrow("Недостаточно остатка");
    const revision = [id(), "revision", "chemical", chem, null, warehouse, null, 750, "Ревизия", 800];
    await db.query("select post_warehouse_operation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", revision);
    expect(Number(await scalar("select kd_warehouse_balance('chemical',$1,$2)", [chem, warehouse]))).toBe(750);
    expect(Number(await scalar("select purchased_ml from chemicals where id=$1", [chem]))).toBe(1000);
  });
  it("carries payroll once and protects the original payment", async () => {
    await actor(); const payment = await scalar("insert into tech_expenses(tech_id,status,amount,expense_date) values($1,'paid',100000,'2026-08-31') returning id", [worker]);
    const args = [id(), payment, "2026-09", 5000, "Переплата за август"];
    await db.query("select carry_payroll_overpayment($1,$2,$3,$4,$5)", args); await db.query("select carry_payroll_overpayment($1,$2,$3,$4,$5)", args);
    expect(await scalar("select count(*)::int from payroll_carryovers where payment_id=$1", [payment])).toBe(1);
    await expect(db.query("update tech_expenses set amount=1 where id=$1", [payment])).rejects.toThrow("перенос");
    await expect(db.query("select carry_payroll_overpayment($1,$2,'2026-10',99000,'Ошибка')", [id(), payment])).rejects.toThrow("превышает");
  });
  it("counts same-day issues after a revision and transfers employee stock once", async () => {
    await actor(); const chemical = await scalar("insert into chemicals(name,purchased_ml,unit_kind) values('Для ревизии',1000,'volume') returning id");
    const date = await scalar("select to_char(now() at time zone 'Asia/Almaty','YYYY-MM-DD')");
    await db.query("insert into handouts(tech_id,chemical_id,amount,created_at) values($1,$2,200,now()-interval '1 hour')", [worker, chemical]);
    const revision = [id(), worker, chemical, "revision", 150, null, date, "Пересчёт", null, 200];
    await db.query("select post_employee_stock_operation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", revision);
    await db.query("select post_employee_stock_operation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", revision);
    await db.query("insert into handouts(tech_id,chemical_id,amount,created_at) values($1,$2,25,clock_timestamp()+interval '1 millisecond')", [worker, chemical]);
    expect(Number(await scalar("select kd_employee_chemical_balance($1,$2)", [worker, chemical]))).toBe(175);
    const transfer = [id(), worker, chemical, "transfer", 50, observer, date, "Передал коллеге", null, 175];
    await db.query("select post_employee_stock_operation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", transfer);
    await db.query("select post_employee_stock_operation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", transfer);
    expect(Number(await scalar("select kd_employee_chemical_balance($1,$2)", [worker, chemical]))).toBe(125);
    expect(Number(await scalar("select kd_employee_chemical_balance($1,$2)", [observer, chemical]))).toBe(50);
    await expect(db.query("select post_employee_stock_operation($1,$2,$3,'transfer',150,$4,$5,'Ошибочная передача',null,125)", [id(), worker, chemical, observer, date])).rejects.toThrow("Недостаточно");
    expect(Number(await scalar("select sum(inventory_delta) from warehouse_moves where item_id=$1", [chemical]))).toBe(-50);
  });
  it("links partner security and prevents returning more than received", async () => {
    await actor(); const partner = await scalar("insert into partners(name) values('Партнёр') returning id");
    const tender = await scalar("insert into tenders(title,partner_id) values('Тест',$1) returning id", [partner]);
    const guarantee = await scalar("insert into tender_guarantees(tender_id,amount) values($1,1000) returning id", [tender]);
    const incoming = await scalar("insert into money_moves(direction,amount,move_date) values('income',1000,'2026-09-14') returning id");
    await db.query("select link_tender_payment($1,$2,'partner_dumping_in',$3,'Получили')", [tender, incoming, guarantee]);
    const outgoing = await scalar("insert into money_moves(direction,amount,move_date) values('expense',2000,'2026-09-14') returning id");
    await expect(db.query("select link_tender_payment($1,$2,'partner_dumping_out',$3,'Возврат')", [tender, outgoing, guarantee])).rejects.toThrow("превышает");
    await expect(db.query("delete from money_moves where id=$1", [incoming])).rejects.toThrow("тендером");
  });
});
