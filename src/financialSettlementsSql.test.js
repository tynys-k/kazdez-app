import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ATOMIC_SETTLEMENTS_MIGRATION } from "./financialPosting";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/2026-09-07_atomic_settlements.sql"),
  "utf8",
);

describe("atomic financial settlements", () => {
  it("publishes the migration name used by the client", () => {
    expect(ATOMIC_SETTLEMENTS_MIGRATION).toBe("2026-09-07_atomic_settlements.sql");
  });

  it("derives paperwork direction and payout from a locked server row", () => {
    expect(sql).toMatch(/from public\.paperwork[\s\S]*for update/i);
    expect(sql).toContain("v_payout := v_row.amount - round(v_row.amount * v_row.percent / 100)");
    expect(sql).toContain("when v_row.scheme = 'for_partner' then 'expense' else 'income'");
  });

  it("derives the tender movement from the locked guarantee", () => {
    expect(sql).toMatch(/from public\.tender_guarantees[\s\S]*for update/i);
    expect(sql).toContain("p_account_id, 'expense', v_guarantee.amount");
  });

  it("requires active authorized users and revokes anonymous execution", () => {
    expect(sql.match(/coalesce\(public\.kd_account_active\(\), false\)/g)).toHaveLength(2);
    expect(sql.match(/revoke all on function public\.post_/g)).toHaveLength(2);
  });

  it("serializes old-client inserts and rejects conflicting movements", () => {
    expect(sql).toContain("NEW.source in ('paperwork', 'tender_pledge')");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql.match(/errcode = '23505'/g)).toHaveLength(3);
    expect(sql.match(/return v_move\.id/g)).toHaveLength(4);
  });
});
