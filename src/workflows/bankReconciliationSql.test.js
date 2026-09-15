import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(fileURLToPath(new URL("../../supabase/2026-09-16_bank_reconciliation.sql", import.meta.url)), "utf8");

describe("bank reconciliation migration", () => {
  it("uses restricted tables and permission-checked RPCs", () => {
    expect(sql).toMatch(/alter table public\.bank_statements enable row level security/i);
    expect(sql).toMatch(/alter table public\.bank_transactions enable row level security/i);
    expect(sql).toMatch(/alter table public\.bank_evidence enable row level security/i);
    expect(sql.match(/kd_has_permission\('action\.finance_edit'\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toMatch(/revoke all on function public\.import_bank_statement/i);
  });
  it("keeps reconciliation evidence when old statements are removed", () => {
    expect(sql).toMatch(/transaction_id uuid unique references public\.bank_transactions\(id\) on delete set null/i);
    expect(sql).toMatch(/if v_missing>0 then raise exception/i);
    expect(sql).toMatch(/delete from public\.bank_statements where id=p_statement_id/i);
    expect(sql).toMatch(/verified_money_move_guard before update or delete/i);
  });
  it("blocks duplicate imports and double counting of QR", () => {
    expect(sql).toMatch(/unique\(account_id, fingerprint\)/i);
    expect(sql).toMatch(/bank_evidence_qr_job_once/i);
    expect(sql).toMatch(/v_row\.amount-v_job\.report_qr/i);
    expect(sql).toMatch(/v_expected is distinct from v_row\.direction/i);
  });
});
