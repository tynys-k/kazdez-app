import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_RECEIPTS_MIGRATION, atomicReceiptRpcUnavailable } from "./financialPosting";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/2026-09-07_atomic_receipts.sql"),
  "utf8",
);

describe("atomic receipt posting", () => {
  it("detects only a missing PostgREST RPC", () => {
    expect(ATOMIC_RECEIPTS_MIGRATION).toBe("2026-09-07_atomic_receipts.sql");
    expect(atomicReceiptRpcUnavailable({ code: "PGRST202" }, "post_job_debt_payment_atomic")).toBe(true);
    expect(atomicReceiptRpcUnavailable({ message: "Could not find post_chemical_sale_payment_atomic in the schema cache" }, "post_chemical_sale_payment_atomic")).toBe(true);
    expect(atomicReceiptRpcUnavailable({ message: "network failed" }, "post_job_debt_payment_atomic")).toBe(false);
  });

  it("derives trusted amounts from locked source rows", () => {
    expect(sql).toMatch(/from public\.job_debts[\s\S]*for update/i);
    expect(sql).toMatch(/from public\.chemical_sales[\s\S]*for update/i);
    expect(sql).toContain("p_account_id, 'income', v_debt.amount");
    expect(sql).toContain("p_account_id, 'income', v_sale.total");
  });

  it("requires an active finance user and hides both functions from anonymous callers", () => {
    expect(sql.match(/coalesce\(public\.kd_account_active\(\), false\)/g)).toHaveLength(2);
    expect(sql.match(/public\.kd_has_permission\('action\.finance_edit'\)/g)).toHaveLength(2);
    expect(sql.match(/revoke all on function public\.post_/g)).toHaveLength(2);
  });

  it("returns an identical existing movement and rejects a conflicting one", () => {
    expect(sql.match(/where source = '(job_debt|chem_sale)' and ref_id = p_/g)).toHaveLength(2);
    expect(sql.match(/errcode = '23505'/g)).toHaveLength(3);
    expect(sql.match(/return v_move\.id/g)).toHaveLength(4);
  });

  it("prevents an old client from creating another derived receipt", () => {
    expect(sql).toMatch(/function public\.kd_prevent_duplicate_derived_receipt\(\)[\s\S]*security definer/i);
    expect(sql).toContain("NEW.source in ('job_debt', 'chem_sale')");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toMatch(/create trigger kd_no_duplicate_derived_receipt[\s\S]*before insert on public\.money_moves/i);
  });
});
