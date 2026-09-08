import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_JOB_RECEIPTS_MIGRATION } from "./financialPosting";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", ATOMIC_JOB_RECEIPTS_MIGRATION), "utf8");

describe("atomic job receipts", () => {
  it("locks the source job and derives transfer amount from it", () => {
    expect(sql).toMatch(/from public\.jobs where id = p_job_id for update/i);
    expect(sql).toMatch(/'income', v_job\.report_transfer, p_paid_on/i);
  });

  it("stores the transfer flag and receipt in one server transaction", () => {
    expect(sql).toMatch(/set transfer_paid = true[\s\S]*insert into public\.money_moves/i);
    expect(sql).toContain("'job_transfer', p_job_id");
  });

  it("requires an account and date for every bank transfer receipt", () => {
    expect(sql).toMatch(/p_job_id is null or p_account_id is null or p_paid_on is null/i);
  });

  it("calculates the executor net share on the server", () => {
    expect(sql).toMatch(/v_our_part := round\(p_full_amount \* \(100 - coalesce\(v_job\.executor_share_pct, 0\)\) \/ 100\)/i);
    expect(sql).toMatch(/'income', v_our_part, p_paid_on/i);
  });

  it("rejects conflicting repeats and reconciles an exact existing move", () => {
    expect(sql).toMatch(/v_move_count > 1/g);
    expect(sql).toMatch(/v_move\.amount is distinct from v_job\.report_transfer/i);
    expect(sql).toMatch(/v_move\.amount is distinct from v_our_part/i);
  });

  it("protects new sources from duplicate writes by old tabs", () => {
    expect(sql).toContain("'job_transfer', 'executor_net'");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("checks active users and blocks anonymous execution", () => {
    expect(sql.match(/coalesce\(public\.kd_account_active\(\), false\)/g)).toHaveLength(2);
    expect(sql).toMatch(/revoke all on function public\.post_job_transfer_payment_atomic[\s\S]*from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.complete_executor_job_atomic[\s\S]*to authenticated, service_role/i);
  });
});
