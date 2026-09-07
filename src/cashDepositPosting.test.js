import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ATOMIC_CASH_DEPOSITS_MIGRATION } from "./financialPosting";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(here, "..", "supabase", ATOMIC_CASH_DEPOSITS_MIGRATION), "utf8");

describe("atomic cash deposits", () => {
  it("provides decision and cancellation APIs", () => {
    expect(sql).toMatch(/function public\.decide_cash_deposit_atomic/i);
    expect(sql).toMatch(/function public\.cancel_cash_deposit_atomic/i);
  });

  it("locks the deposit before changing it", () => {
    expect(sql.match(/from public\.cash_deposits[\s\S]*?for update/gi)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('deposit:'/i);
  });

  it("derives the movement amount from the locked request", () => {
    expect(sql).toMatch(/v_deposit\.amount is null or v_deposit\.amount <= 0/i);
    expect(sql).toMatch(/p_account_id, 'income', v_deposit\.amount, p_decided_on/i);
    expect(sql).not.toMatch(/p_amount/i);
  });

  it("does not allow a confirmed request to be rejected", () => {
    expect(sql).toMatch(/v_deposit\.status = 'confirmed' and v_status <> 'confirmed'/i);
    expect(sql).toMatch(/Подтверждённое поступление нельзя отклонить/i);
  });

  it("makes deposit movements unique and retries safe", () => {
    expect(sql).toMatch(/'paperwork', 'tender_pledge', 'tender_return', 'deposit'/i);
    expect(sql).toMatch(/if v_deposit\.status = 'confirmed' then return v_move\.id/i);
  });

  it("only cancels a pending request without a movement", () => {
    expect(sql).toMatch(/v_deposit\.status <> 'pending'/i);
    expect(sql).toMatch(/where source = 'deposit' and ref_id = p_deposit_id/i);
    expect(sql).toMatch(/v_deposit\.tech_id <> auth\.uid\(\)/i);
  });

  it("checks finance permissions and blocks anonymous execution", () => {
    expect(sql).toMatch(/kd_has_permission\('action\.finance_edit'\)/i);
    expect(sql).toMatch(/revoke all on function public\.decide_cash_deposit_atomic[\s\S]*from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.cancel_cash_deposit_atomic\(uuid\) to authenticated, service_role/i);
  });
});
