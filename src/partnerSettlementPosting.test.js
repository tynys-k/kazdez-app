import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_PARTNER_SETTLEMENTS_MIGRATION } from "./financialPosting";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", ATOMIC_PARTNER_SETTLEMENTS_MIGRATION), "utf8");

describe("atomic partner settlements", () => {
  it("supports referral payouts, executor payouts and partner compensation", () => {
    expect(sql).toContain("'partner_payout', 'executor_payout', 'partner_compensation'");
    expect(sql).toMatch(/function public\.post_job_partner_settlement_atomic/i);
  });

  it("derives every amount from the locked job", () => {
    expect(sql).toMatch(/from public\.jobs where id = p_job_id for update/i);
    expect(sql).toMatch(/v_amount :=.*report_paid[\s\S]*partner_share/is);
    expect(sql).toMatch(/v_amount := round\(coalesce\(v_job\.report_paid[\s\S]*executor_share_pct/is);
    expect(sql).toMatch(/v_amount := coalesce\(v_job\.partner_comp, 0\)/i);
  });

  it("prices joint-work chemicals from purchase history", () => {
    expect(sql).toMatch(/jsonb_array_elements\(coalesce\(v_job\.chemicals/i);
    expect(sql).toMatch(/from public\.chemical_purchases cp[\s\S]*order by cp\.purchase_date desc/i);
  });

  it("writes the money movement before marking the job settled", () => {
    expect(sql).toMatch(/insert into public\.money_moves[\s\S]*update public\.jobs set partner_paid = true/i);
    expect(sql).toMatch(/direction := 'expense'/i);
    expect(sql).toMatch(/direction := 'income'/i);
  });

  it("reconciles retries and rejects legacy flag-only settlements", () => {
    expect(sql).toMatch(/select count\(\*\).*source = v_source and ref_id = p_job_id/i);
    expect(sql).toContain("Расчёт отмечен флагом, но движение по счёту отсутствует");
  });

  it("blocks old tabs from toggling settlement flags", () => {
    expect(sql).toMatch(/trigger kd_protect_job_partner_settlements/i);
    expect(sql).toContain("Сначала проведите выплату партнёру через счёт");
    expect(sql).toContain("Проведённую выплату исполнителю нельзя снять флагом");
  });

  it("requires active finance access and blocks anonymous execution", () => {
    expect(sql).toMatch(/coalesce\(public\.kd_account_active\(\), false\)/i);
    expect(sql).toMatch(/kd_has_permission\('action\.finance_edit'\)/i);
    expect(sql).toMatch(/revoke all on function public\.post_job_partner_settlement_atomic[\s\S]*from public, anon/i);
  });
});
