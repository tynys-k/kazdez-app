import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ATOMIC_MARKETING_SPEND_MIGRATION } from "./financialPosting";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(here, "..", "supabase", ATOMIC_MARKETING_SPEND_MIGRATION), "utf8");

describe("atomic marketing spend", () => {
  it("adds a unique retry key", () => {
    expect(sql).toMatch(/add column if not exists request_id uuid/i);
    expect(sql).toMatch(/unique index if not exists mkt_topups_request_id_key/i);
  });

  it("locks the channel and derives the movement from the topup", () => {
    expect(sql).toMatch(/from public\.mkt_channels where id = p_channel_id for update/i);
    expect(sql).toMatch(/p_account_id, 'expense', v_topup\.amount, p_spent_on/i);
  });

  it("makes retries and marketing movements unique", () => {
    expect(sql).toMatch(/where request_id = p_request_id for update/i);
    expect(sql).toMatch(/'deposit', 'payroll', 'marketing'/i);
    expect(sql).toMatch(/'marketing', v_topup\.id/i);
  });

  it("atomically deletes one topup after reconciliation", () => {
    expect(sql).toMatch(/function public\.delete_marketing_spend_atomic/i);
    expect(sql).toMatch(/v_move\.amount is distinct from v_topup\.amount/i);
    expect(sql).toMatch(/delete from public\.money_moves[\s\S]*delete from public\.mkt_topups/i);
  });

  it("atomically deletes a channel and all linked financial movements", () => {
    expect(sql).toMatch(/function public\.delete_marketing_channel_atomic/i);
    expect(sql).toMatch(/for v_topup in select \* from public\.mkt_topups/i);
    expect(sql).toMatch(/delete from public\.mkt_topups where channel_id[\s\S]*delete from public\.mkt_channels/i);
  });

  it("checks finance permissions and blocks anonymous execution", () => {
    expect(sql).toMatch(/kd_has_permission\('action\.finance_edit'\)/i);
    expect(sql).toMatch(/revoke all on function public\.post_marketing_spend_atomic[\s\S]*from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.delete_marketing_channel_atomic\(uuid\) to authenticated, service_role/i);
  });
});
