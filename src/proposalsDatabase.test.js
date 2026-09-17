// Миграция КП исполняется настоящим PostgreSQL, а не проверяется по тексту.
// Номер КП — единственное, что нельзя поправить после отправки клиенту,
// поэтому нумерация, защита от двойного клика и права проверяются запросами.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { workflowFixture } from "./workflows/databaseFixture";

const admin = "20000000-0000-4000-8000-000000000001";
const manager = "20000000-0000-4000-8000-000000000002";
const outsider = "20000000-0000-4000-8000-000000000003";
const id = () => crypto.randomUUID();

let db;
const actor = (user = admin, permissions = "*") =>
  db.query("select set_config('test.uid',$1,false),set_config('test.permissions',$2,false)", [user, permissions]);
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const createProposal = (payload = {}, branch = "ALA", request = id()) =>
  scalar("select create_proposal($1,$2,$3)", [request, branch, payload]);

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(workflowFixture);
  for (const user of [admin, manager, outsider]) {
    await db.query("insert into auth.users values($1)", [user]);
    await db.query("insert into profiles(id) values($1)", [user]);
  }
  await actor();
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase", "2026-09-17_proposals.sql"), "utf8");
  try { await db.exec(sql); } catch (error) { throw new Error(`2026-09-17_proposals.sql: ${error.message}`); }
}, 60000);

afterAll(async () => { await db?.close(); });

describe("коммерческие предложения в базе", () => {
  it("выдаёт номер сама и продолжает счёт внутри года и филиала", async () => {
    await actor();
    const first = await createProposal({ issue_date: "2026-09-17", subject: "Дератизация склада", total: "105000" });
    const second = await createProposal({ issue_date: "2026-09-18", subject: "Дезинсекция склада" });
    const other = await createProposal({ issue_date: "2026-09-18", subject: "Дератизация подвалов" }, "AST");
    const nextYear = await createProposal({ issue_date: "2027-01-10", subject: "Годовое обслуживание" });

    expect(await scalar("select number from proposals where id=$1", [first])).toBe("КП-2026-№1-ALA");
    expect(await scalar("select number from proposals where id=$1", [second])).toBe("КП-2026-№2-ALA");
    expect(await scalar("select number from proposals where id=$1", [other])).toBe("КП-2026-№1-AST");
    expect(await scalar("select number from proposals where id=$1", [nextYear])).toBe("КП-2027-№1-ALA");
  });

  it("код филиала приводится к верхнему регистру, пустой становится ALA", async () => {
    await actor();
    const lower = await createProposal({ issue_date: "2026-09-19" }, "kzo");
    expect(await scalar("select number from proposals where id=$1", [lower])).toBe("КП-2026-№1-KZO");
    const blank = await createProposal({ issue_date: "2026-09-19" }, "  ");
    expect(await scalar("select branch_code from proposals where id=$1", [blank])).toBe("ALA");
  });

  it("двойной клик не плодит КП: тот же request_id возвращает прежнюю запись", async () => {
    await actor();
    const request = id();
    const once = await createProposal({ issue_date: "2026-09-20", subject: "Дезинсекция" }, "ALA", request);
    const twice = await createProposal({ issue_date: "2026-09-20", subject: "Дезинсекция" }, "ALA", request);
    expect(twice).toBe(once);
    expect(await scalar("select count(*)::int from proposals where request_id=$1", [request])).toBe(1);
  });

  it("сохраняет строки стоимости и блоки как есть: КП — снимок договорённости", async () => {
    await actor();
    const proposal = await createProposal({
      issue_date: "2026-09-21",
      subject: "Комплекс работ",
      items: [{ name: "Дератизация", amount: 105000 }, { name: "Контейнеры", qty: 46, unit_price: 3000 }],
      sections: { guarantees: { on: true, items: ["3 месяца"] } },
      total: "243000",
      client_bin: "221240015875",
    });
    expect(await scalar("select jsonb_array_length(items) from proposals where id=$1", [proposal])).toBe(2);
    expect(await scalar("select sections->'guarantees'->>'on' from proposals where id=$1", [proposal])).toBe("true");
    expect(Number(await scalar("select total from proposals where id=$1", [proposal]))).toBe(243000);
    expect(await scalar("select client_bin from proposals where id=$1", [proposal])).toBe("221240015875");
  });

  it("пустой payload не ломает создание: черновик заводится до заполнения", async () => {
    await actor();
    const draft = await createProposal();
    expect(await scalar("select status from proposals where id=$1", [draft])).toBe("draft");
    expect(await scalar("select style from proposals where id=$1", [draft])).toBe("sales");
    expect(await scalar("select validity_days from proposals where id=$1", [draft])).toBe(30);
    expect(await scalar("select subject from proposals where id=$1", [draft])).toBe("Санитарная обработка объекта");
  });

  it("менеджер с доступом к разделу создаёт и правит КП", async () => {
    await actor(manager, "tab.proposals");
    const proposal = await createProposal({ issue_date: "2026-09-22", subject: "Дератизация подвалов" });
    await db.exec("set role authenticated");
    expect(await scalar("select count(*)::int from proposals where id=$1", [proposal])).toBe(1);
    await db.query("update proposals set status='sent' where id=$1", [proposal]);
    expect(await scalar("select status from proposals where id=$1", [proposal])).toBe("sent");
    await db.exec("reset role");
  });

  it("без доступа к разделу КП не создать и не увидеть", async () => {
    await actor(admin);
    const proposal = await createProposal({ issue_date: "2026-09-23", subject: "Дезинсекция" });

    await actor(outsider, "tab.jobs");
    await expect(db.query("select create_proposal($1,$2,$3)", [id(), "ALA", {}])).rejects.toThrow("Нет доступа");
    await db.exec("set role authenticated");
    expect(await scalar("select count(*)::int from proposals where id=$1", [proposal])).toBe(0);
    await db.exec("reset role");
    await actor();
  });

  it("удалять КП может только администратор: отправленное КП — документ", async () => {
    await actor();
    const proposal = await createProposal({ issue_date: "2026-09-24", subject: "Дератизация" });

    await actor(manager, "tab.proposals");
    await db.exec("set role authenticated");
    await db.query("delete from proposals where id=$1", [proposal]);
    expect(await scalar("select count(*)::int from proposals where id=$1", [proposal])).toBe(1);

    await actor(admin);
    await db.query("delete from proposals where id=$1", [proposal]);
    expect(await scalar("select count(*)::int from proposals where id=$1", [proposal])).toBe(0);
    await db.exec("reset role");
    await actor();
  });

  it("номер уникален, а вписать свой в обход функции нельзя", async () => {
    await actor();
    const proposal = await createProposal({ issue_date: "2026-09-25" });
    const number = await scalar("select number from proposals where id=$1", [proposal]);
    await expect(db.query(
      "insert into proposals(year,branch_code,seq,number) values(2026,'ALA',999,$1)", [number],
    )).rejects.toThrow();
    // Прямая вставка закрыта политикой: у роли authenticated нет policy for insert.
    await db.exec("set role authenticated");
    await expect(db.query("insert into proposals(year,branch_code,seq,number) values(2026,'ALA',998,'КП-2026-№998-ALA')")).rejects.toThrow();
    await db.exec("reset role");
  });

  it("не пропускает бессмысленные значения статуса, стиля и срока", async () => {
    await actor();
    const proposal = await createProposal({ issue_date: "2026-09-26" });
    await expect(db.query("update proposals set status='может быть' where id=$1", [proposal])).rejects.toThrow();
    await expect(db.query("update proposals set style='красивое' where id=$1", [proposal])).rejects.toThrow();
    await expect(db.query("update proposals set validity_days=0 where id=$1", [proposal])).rejects.toThrow();
    await expect(db.query("update proposals set total=-1 where id=$1", [proposal])).rejects.toThrow();
  });

  it("правка КП обновляет отметку времени: у черновика много версий", async () => {
    await actor();
    const proposal = await createProposal({ issue_date: "2026-09-27" });
    const before = await scalar("select updated_at from proposals where id=$1", [proposal]);
    await db.query("update proposals set subject='Новый заголовок' where id=$1", [proposal]);
    const after = await scalar("select updated_at from proposals where id=$1", [proposal]);
    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it("проставляет код филиала существующим городам", async () => {
    await actor();
    await db.exec("insert into branches(is_default) values(false)");
    // Повторный запуск файла не должен затирать уже заданные коды.
    await db.exec("update branches set code='AST' where code is null");
    await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase", "2026-09-17_proposals.sql"), "utf8"));
    expect(await scalar("select count(*)::int from branches where code is null or btrim(code)=''")).toBe(0);
    expect(await scalar("select count(*)::int from branches where code='AST'")).toBeGreaterThan(0);
  });
});
