import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_LEAD_CONVERSION_MIGRATION } from "./financialPosting";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", ATOMIC_LEAD_CONVERSION_MIGRATION), "utf8");
const app = fs.readFileSync(path.join(process.cwd(), "src", "App.jsx"), "utf8");

describe("atomic lead conversion", () => {
  it("links a job to its source lead exactly once", () => {
    expect(sql).toMatch(/add column if not exists origin_lead_id uuid references public\.leads\(id\)/i);
    expect(sql).toMatch(/unique index if not exists jobs_origin_lead_id_key/i);
    expect(sql).toMatch(/unique index if not exists leads_converted_job_id_key/i);
    expect(sql).toContain("Одна заявка связана с несколькими лидами");
  });

  it("locks the lead before checking or creating its job", () => {
    expect(sql).toMatch(/from public\.leads[\s\S]*where id = p_lead_id[\s\S]*for update/i);
    expect(sql).toMatch(/if v_lead\.converted_job_id is not null[\s\S]*return v_existing_job_id/i);
  });

  it("creates the order, first visit and conversion link in one function", () => {
    expect(sql).toMatch(/function public\.convert_lead_to_job_atomic/i);
    expect(sql).toMatch(/insert into public\.orders[\s\S]*insert into public\.jobs[\s\S]*update public\.leads/i);
    expect(sql).toMatch(/update public\.orders set root_job_id = v_job_id/i);
  });

  it("chooses only a successful final CRM stage on the server", () => {
    expect(sql).toMatch(/from public\.lead_stages[\s\S]*is_final = true[\s\S]*is_lost, false\) = false/i);
  });

  it("requires an active CRM manager and hides the function from anonymous callers", () => {
    expect(sql).toMatch(/coalesce\(public\.kd_account_active\(\), false\)/i);
    expect(sql).toMatch(/kd_has_role\(array\['admin', 'manager'\]\)/i);
    expect(sql).toMatch(/revoke all on function public\.convert_lead_to_job_atomic[\s\S]*from public, anon/i);
  });

  it("uses only the atomic RPC from the current client", () => {
    expect(app).toMatch(/async function convertLeadToJob[\s\S]*supabase\.rpc\(rpcName/i);
    expect(app).not.toMatch(/async function convertLeadToJob[\s\S]{0,900}from\("jobs"\)\.insert/i);
    expect(app).toContain("ATOMIC_LEAD_CONVERSION_MIGRATION");
  });
});
