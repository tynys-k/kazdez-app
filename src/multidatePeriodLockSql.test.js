import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/2026-09-07_multidate_period_lock.sql"),
  "utf8",
);

describe("multi-date period lock migration", () => {
  it("ties debt principal changes to the server-side job date", () => {
    expect(sql).toMatch(/function public\.kd_enforce_job_debt_open_period\(\)[\s\S]*security definer/i);
    expect(sql).toContain("coalesce(j.scheduled_date, j.created_at::date)");
    expect(sql).toContain("revoke all on function public.kd_enforce_job_debt_open_period() from public, anon, authenticated");
  });

  it("keeps original events separate from later payments and settlements", () => {
    expect(sql).toContain("kd_closed_period_chemical_sale_update");
    expect(sql).toContain("kd_closed_period_chemical_payment_update");
    expect(sql).toContain("kd_closed_period_job_debt_payment_update");
    expect(sql).toContain("kd_closed_period_paperwork_payment_update");
    expect(sql).toContain("kd_closed_period_paperwork_settlement_update");
    expect(sql).toContain("kd_closed_period_guarantee_payment_update");
    expect(sql).toContain("kd_closed_period_guarantee_return_update");
  });

  it("does not fall back to the old creation date for a new late payment", () => {
    expect(sql).toMatch(/chemical_payment_update[\s\S]*kd_enforce_open_period\('paid_on'\)/);
    expect(sql).toMatch(/job_debt_payment_update[\s\S]*kd_enforce_open_period\('paid_on'\)/);
    expect(sql).toMatch(/paperwork_settlement_update[\s\S]*kd_enforce_open_period\('settled_at'\)/);
  });

  it("guards all five verified multi-date ledgers", () => {
    ["chemical_sales", "job_debts", "paperwork", "tender_guarantees", "guarantee_returns"]
      .forEach((table) => expect(sql).toContain(`on public.${table}`));
    expect(sql.match(/create trigger kd_closed_period_/g)).toHaveLength(17);
  });
});
