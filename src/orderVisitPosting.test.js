import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_ORDER_VISITS_MIGRATION } from "./financialPosting";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", ATOMIC_ORDER_VISITS_MIGRATION), "utf8");
const app = fs.readFileSync(path.join(process.cwd(), "src", "App.jsx"), "utf8");
const modals = fs.readFileSync(path.join(process.cwd(), "src", "modals.jsx"), "utf8");

describe("atomic order visits", () => {
  it("protects visit numbers and retry identities", () => {
    expect(sql).toMatch(/unique index if not exists jobs_order_visit_no_key/i);
    expect(sql).toMatch(/unique index if not exists jobs_visit_request_key/i);
    expect(sql).toMatch(/unique index if not exists jobs_repeat_origin_active_key/i);
  });

  it("locks the origin and order before choosing the next number", () => {
    expect(sql).toMatch(/where id = p_origin_job_id[\s\S]*for update/i);
    expect(sql).toMatch(/from public\.orders where id = v_origin\.order_id for update/i);
    expect(sql).toMatch(/max\(visit_no\)[\s\S]*where order_id = v_origin\.order_id/i);
  });

  it("creates both supported visit kinds in one function", () => {
    expect(sql).toMatch(/function public\.create_order_visit_atomic/i);
    expect(sql).toContain("p_kind not in ('control', 'guarantee')");
    expect(sql).toMatch(/insert into public\.jobs[\s\S]*case when p_kind = 'guarantee' then 'Вторичная' else 'Плановая' end/i);
  });

  it("finishes the repeat only in the same transaction", () => {
    expect(sql).toMatch(/if p_kind = 'guarantee'[\s\S]*update public\.jobs set repeat_state = 'finished'/i);
  });

  it("keeps a stable request id in the control-visit modal", () => {
    expect(modals).toMatch(/function AddVisitModal[\s\S]{0,300}useRef\(createFinancialRequestId\(\)\)/i);
    expect(modals).toMatch(/request_id: requestIdRef\.current/i);
  });

  it("uses only the atomic RPC in both client actions", () => {
    expect(app).toMatch(/async function createRepeatJob[\s\S]{0,700}supabase\.rpc\(rpcName/i);
    expect(app).toMatch(/async function addVisit[\s\S]{0,700}supabase\.rpc\(rpcName/i);
    expect(app).not.toMatch(/async function createRepeatJob[\s\S]{0,1200}insertCompatibleJob/i);
    expect(app).not.toMatch(/async function addVisit[\s\S]{0,1200}insertCompatibleJob/i);
  });
});
