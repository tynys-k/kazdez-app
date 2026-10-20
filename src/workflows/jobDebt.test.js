import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { workflowFixture } from "./databaseFixture";
import { JOB_DEBT_MIGRATION, debtJobs, jobDebtState } from "./jobDebtModel";

describe("состояние долга заявки", () => {
  it("отмеченная, но не выполненная заявка — ожидаемый долг", () => {
    expect(jobDebtState({ id: 1, status: "new", debt_mode: "advance", debt_due_on: "2026-11-01" }, []))
      .toEqual({ kind: "expected", amount: null, dueOn: "2026-11-01" });
  });

  it("открытый долг из отчёта важнее отметки и суммируется", () => {
    const debts = [{ id: "a", job_id: 1, amount: 5000, due_on: "2026-11-10" }, { id: "b", job_id: 1, amount: 2000, due_on: "2026-11-05" }];
    expect(jobDebtState({ id: 1, status: "done" }, debts)).toMatchObject({ kind: "open", amount: 7000, dueOn: "2026-11-05" });
  });

  it("погашенный долг и отменённые заявки не попадают во вкладку", () => {
    const jobs = [
      { id: 1, status: "done", debt_mode: "on_site" },
      { id: 2, status: "canceled", debt_mode: "advance" },
      { id: 3, status: "assigned" },
    ];
    const debts = [{ job_id: 1, amount: 3000, paid_on: "2026-10-01" }];
    expect(debtJobs(jobs, debts)).toEqual([]);
    expect(debtJobs(jobs, debts, { includePaid: true }).map((x) => x.job.id)).toEqual([1]);
  });

  it("сначала открытые долги по сроку, потом ожидаемые", () => {
    const jobs = [
      { id: 1, status: "new", debt_mode: "advance" },
      { id: 2, status: "done" },
      { id: 3, status: "done" },
    ];
    const debts = [{ job_id: 2, amount: 1, due_on: "2026-12-01" }, { job_id: 3, amount: 1, due_on: "2026-11-01" }];
    expect(debtJobs(jobs, debts).map((x) => x.job.id)).toEqual([3, 2, 1]);
  });
});

describe("миграция оплаты в долг", () => {
  let db;
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(workflowFixture);
    const user = "20000000-0000-4000-8000-000000000001";
    await db.query("insert into auth.users values($1)", [user]);
    await db.query("insert into profiles(id) values($1)", [user]);
    await db.query("select set_config('test.uid',$1,false),set_config('test.permissions','*',false)", [user]);
    await db.exec("insert into branches(is_default) values(true)");
    for (const name of ["2026-09-14_job_object_measurements.sql", JOB_DEBT_MIGRATION, JOB_DEBT_MIGRATION]) {
      await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase", name), "utf8"));
    }
  }, 60000);
  afterAll(async () => { await db?.close(); });

  const base = { address: "Абая 10", pest: "Клопы", client_phone: "+77010000000", type: "Первичная", price_options: [{ label: "Стоимость", amount: 15000 }] };
  const create = async (job) => (await db.query("select create_job_atomic($1,$2) as id", [crypto.randomUUID(), job])).rows[0].id;

  it("сохраняет отметку и срок при атомарном создании", async () => {
    const id = await create({ ...base, debt_mode: "on_site", debt_due_on: "2026-11-15" });
    const row = (await db.query("select debt_mode, debt_due_on::text as due from jobs where id=$1", [id])).rows[0];
    expect(row).toEqual({ debt_mode: "on_site", due: "2026-11-15" });
  });

  it("без отметки срок не сохраняется, неизвестный вид отклоняется", async () => {
    const id = await create({ ...base, debt_due_on: "2026-11-15" });
    expect((await db.query("select debt_mode, debt_due_on from jobs where id=$1", [id])).rows[0]).toEqual({ debt_mode: null, debt_due_on: null });
    await expect(create({ ...base, debt_mode: "forever" })).rejects.toThrow("Некорректный вид оплаты в долг");
  });
});
