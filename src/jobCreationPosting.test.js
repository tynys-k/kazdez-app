import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_JOB_CREATION_MIGRATION } from "./financialPosting";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", ATOMIC_JOB_CREATION_MIGRATION), "utf8");
const app = fs.readFileSync(path.join(process.cwd(), "src", "App.jsx"), "utf8");
const modals = fs.readFileSync(path.join(process.cwd(), "src", "modals.jsx"), "utf8");

describe("atomic job creation", () => {
  it("stores a unique creation request on the job", () => {
    expect(sql).toMatch(/add column if not exists creation_request_id uuid/i);
    expect(sql).toMatch(/unique index if not exists jobs_creation_request_key/i);
  });

  it("serializes retries and returns the existing job", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\(p_request_id::text, 0\)\)/i);
    expect(sql).toMatch(/where creation_request_id = p_request_id[\s\S]*return v_existing_id/i);
  });

  it("creates object, order and job before linking the root visit", () => {
    expect(sql).toMatch(/insert into public\.objects[\s\S]*insert into public\.orders[\s\S]*insert into public\.jobs[\s\S]*update public\.orders set root_job_id/i);
  });

  it("validates core business fields on the server", () => {
    expect(sql).toContain("Укажите корректный телефон клиента");
    expect(sql).toContain("Укажите стоимость или выберите оценку на месте");
    expect(sql).toMatch(/coalesce\(v_input\.type, ''\) <> 'Осмотр'/i);
    expect(sql).toMatch(/kd_account_active\(\)[\s\S]*action\.jobs_edit/i);
  });

  it("keeps the request id with the saved draft", () => {
    expect(modals).toMatch(/requestIdRef = useRef\(initial \? null : \(draft\?\.requestId \|\| createFinancialRequestId\(\)\)\)/i);
    expect(modals).toMatch(/ownerId: String\(draftOwnerId\), requestId: requestIdRef\.current, form: f/i);
  });

  it("uses the RPC instead of separate object, order and job writes", () => {
    expect(app).toMatch(/async function createJob[\s\S]{0,700}supabase\.rpc\(rpcName/i);
    expect(app).not.toMatch(/async function createJob[\s\S]{0,1400}(ensureObject|ensureOrder|insertCompatibleJob)\(/i);
    expect(app).toContain("ATOMIC_JOB_CREATION_MIGRATION");
  });
});
