import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ATOMIC_PAYROLL_MIGRATION } from "./financialPosting";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(here, "..", "supabase", ATOMIC_PAYROLL_MIGRATION), "utf8");

describe("atomic payroll posting", () => {
  it("adds a unique retry key for new payments", () => {
    expect(sql).toMatch(/add column if not exists request_id uuid/i);
    expect(sql).toMatch(/unique index if not exists tech_expenses_request_id_key/i);
    expect(sql).toMatch(/where request_id = p_request_id[\s\S]*for update/i);
  });

  it("posts new and existing expenses through one API", () => {
    expect(sql).toMatch(/function public\.post_payroll_payment_atomic/i);
    expect(sql).toMatch(/if p_expense_id is null then/i);
    expect(sql).toMatch(/where id = p_expense_id[\s\S]*for update/i);
  });

  it("preserves an existing accrual amount and type", () => {
    expect(sql).toMatch(/v_move\.amount is distinct from v_expense\.amount/i);
    expect(sql).toMatch(/set status = 'paid', account_id = p_account_id, paid_at = p_paid_on/i);
    expect(sql).not.toMatch(/set[\s\S]{0,100}amount = p_amount/i);
  });

  it("creates the payroll movement in the same transaction", () => {
    expect(sql).toMatch(/insert into public\.tech_expenses/i);
    expect(sql).toMatch(/insert into public\.money_moves/i);
    expect(sql).toMatch(/p_account_id, 'expense', v_expense\.amount, p_paid_on/i);
  });

  it("serializes and rejects duplicate payroll movements", () => {
    expect(sql).toMatch(/'paperwork', 'tender_pledge', 'tender_return', 'deposit', 'payroll'/i);
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('payroll:'/i);
    expect(sql).toMatch(/if v_move_count > 1 then/i);
  });

  it("deletes the movement and expense atomically after reconciliation", () => {
    expect(sql).toMatch(/function public\.delete_payroll_expense_atomic/i);
    expect(sql).toMatch(/v_move\.move_date is distinct from coalesce\(v_expense\.paid_at, v_expense\.expense_date\)/i);
    expect(sql).toMatch(/delete from public\.money_moves[\s\S]*delete from public\.tech_expenses/i);
  });

  it("checks finance permissions and blocks anonymous execution", () => {
    expect(sql).toMatch(/kd_has_permission\('action\.finance_edit'\)/i);
    expect(sql).toMatch(/revoke all on function public\.post_payroll_payment_atomic[\s\S]*from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.delete_payroll_expense_atomic\(uuid\) to authenticated, service_role/i);
  });
});
