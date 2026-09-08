import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_CONTRACT_VISITS_MIGRATION } from "./financialPosting";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", ATOMIC_CONTRACT_VISITS_MIGRATION), "utf8");
const app = fs.readFileSync(path.join(process.cwd(), "src", "App.jsx"), "utf8");

describe("atomic contract visits", () => {
  it("identifies each planned cycle and forbids a second active visit", () => {
    expect(sql).toMatch(/add column if not exists contract_cycle_date date/i);
    expect(sql).toMatch(/unique index if not exists jobs_contract_cycle_active_key/i);
    expect(sql).toContain("По одной дате договора найдено несколько действующих заявок");
  });

  it("locks the contract before checking the expected cycle", () => {
    expect(sql).toMatch(/from public\.service_contracts[\s\S]*where id = p_contract_id[\s\S]*for update/i);
    expect(sql).toMatch(/contract_cycle_date = p_expected_service_date/i);
  });

  it("creates the order, visit and next date in one function", () => {
    expect(sql).toMatch(/function public\.create_contract_visit_atomic/i);
    expect(sql).toMatch(/insert into public\.orders[\s\S]*insert into public\.jobs[\s\S]*update public\.service_contracts/i);
    expect(sql).toMatch(/update public\.orders set root_job_id = v_job_id/i);
  });

  it("returns the same visit on an exact retry", () => {
    expect(sql).toMatch(/if v_existing_job_id is not null[\s\S]*return v_existing_job_id/i);
    expect(sql).toContain("Дата договора уже изменилась");
  });

  it("requires an active jobs manager and blocks anonymous execution", () => {
    expect(sql).toMatch(/coalesce\(public\.kd_account_active\(\), false\)/i);
    expect(sql).toMatch(/kd_has_permission\('action\.jobs_edit'\)/i);
    expect(sql).toMatch(/revoke all on function public\.create_contract_visit_atomic[\s\S]*from public, anon/i);
  });

  it("uses only the atomic RPC from the current client", () => {
    expect(app).toMatch(/async function createContractJob[\s\S]{0,500}supabase\.rpc\(rpcName/i);
    expect(app).not.toMatch(/async function createContractJob[\s\S]{0,1200}insertCompatibleJob/i);
    expect(app).toContain("ATOMIC_CONTRACT_VISITS_MIGRATION");
  });
});
