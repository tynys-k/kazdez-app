import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { workflowFixture } from "./databaseFixture";
import { COMPANY_PULSE_MIGRATION } from "./pulseModel";

const admin = "50000000-0000-4000-8000-000000000001", owner = "50000000-0000-4000-8000-000000000002", outsider = "50000000-0000-4000-8000-000000000003";
let db;
const actor = (user = admin, permissions = "*") => db.query("select set_config('test.uid',$1,false),set_config('test.permissions',$2,false)", [user, permissions]);
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const decide = (key, action, extra = {}) => scalar("select kd_pulse_decide($1,$2,$3,$4,$5,$6,$7)", [key, `Отклонение ${key}`, action, extra.owner ?? null, extra.due ?? null, extra.until ?? null, extra.note ?? null]);

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(workflowFixture);
  for (const user of [admin, owner, outsider]) { await db.query("insert into auth.users values($1)", [user]); await db.query("insert into profiles(id, full_name) values($1,'Сотрудник')", [user]); }
  await actor();
  // Миграцию применяют дважды: повторный запуск не должен ломаться.
  for (let i = 0; i < 2; i += 1) {
    try { await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase", COMPANY_PULSE_MIGRATION), "utf8")); }
    catch (e) { throw new Error(`${COMPANY_PULSE_MIGRATION}: ${e.message}`); }
  }
}, 60000);
afterAll(async () => { await db?.close(); });

describe("миграция пульса компании", () => {
  it("назначает ответственного вместе с задачей и держит одно открытое решение", async () => {
    await actor();
    const first = await decide("debts", "assign", { owner, due: "2099-01-10", note: "Позвонить трём должникам" });
    const task = (await db.query("select t.title, t.assignee_id, t.due_date::text due, t.description from pulse_decisions d join tasks t on t.id=d.task_id where d.id=$1", [first])).rows[0];
    expect(task).toMatchObject({ title: "Пульс: Отклонение debts", assignee_id: owner, due: "2099-01-10" });
    expect(task.description).toContain("Позвонить трём должникам");

    await decide("debts", "snooze", { until: "2099-02-01" });
    expect(await scalar("select count(*)::int from pulse_decisions where alert_key='debts' and status='open'")).toBe(1);
    expect(await scalar("select snoozed_until::text from pulse_decisions where alert_key='debts' and status='open'")).toBe("2099-02-01");

    await decide("debts", "close");
    expect(await scalar("select count(*)::int from pulse_decisions where alert_key='debts' and status='open'")).toBe(0);
  });

  it("отклоняет решение без срока и перенос в прошлое", async () => {
    await actor();
    await expect(decide("stock", "assign", { owner })).rejects.toThrow("ответственного и срок");
    await expect(decide("stock", "snooze", { until: "2000-01-01" })).rejects.toThrow("будущей даты");
  });

  it("пускает к целям и решениям только тех, у кого есть вкладка", async () => {
    await actor(owner, "tab.pulse");
    await db.exec("set role authenticated");
    await db.query("insert into pulse_targets(month, revenue, jobs) values('2026-10-01', 3000000, 80)");
    await db.query("update pulse_targets set revenue=3500000 where month='2026-10-01'");
    expect(await scalar("select revenue::int from pulse_targets where month='2026-10-01'")).toBe(3500000);
    await expect(db.query("insert into pulse_targets(month) values('2026-10-15')")).rejects.toThrow();
    // Писать решения напрямую нельзя — только через функцию.
    await expect(db.query("insert into pulse_decisions(alert_key, owner_id) values('x', $1)", [owner])).rejects.toThrow();

    await actor(outsider, "tab.jobs");
    expect(await scalar("select count(*)::int from pulse_targets")).toBe(0);
    await expect(decide("tasks", "assign", { owner, due: "2099-01-01" })).rejects.toThrow("Нет доступа");
    await db.exec("reset role");
    await actor();
  });
});
