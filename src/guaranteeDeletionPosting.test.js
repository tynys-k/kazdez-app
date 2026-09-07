import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ATOMIC_GUARANTEE_DELETIONS_MIGRATION } from "./financialPosting";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(here, "..", "supabase", ATOMIC_GUARANTEE_DELETIONS_MIGRATION), "utf8").replace(/\r\n/g, "\n");

describe("atomic tender guarantee deletions", () => {
  it("provides APIs for one return and the whole guarantee", () => {
    expect(sql).toMatch(/function public\.delete_tender_guarantee_return_atomic\(p_return_id uuid\)/i);
    expect(sql).toMatch(/function public\.delete_tender_guarantee_atomic\(p_guarantee_id uuid\)/i);
  });

  it("locks the parent before removing return data", () => {
    expect(sql).toMatch(/perform 1 from public\.tender_guarantees[\s\S]*for update/i);
    expect(sql).toMatch(/from public\.guarantee_returns[\s\S]*for update/i);
  });

  it("verifies movements against their source records", () => {
    expect(sql).toMatch(/v_move\.direction <> 'income'/i);
    expect(sql).toMatch(/v_move\.amount is distinct from v_return\.amount/i);
    expect(sql).toMatch(/v_move\.direction <> 'expense'/i);
    expect(sql).toMatch(/v_move\.amount is distinct from v_guarantee\.amount/i);
  });

  it("serializes deletion with legacy movement inserts", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('tender_pledge:'/i);
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('tender_return:'/i);
  });

  it("deletes dependent movements before source records", () => {
    const moveDelete = sql.indexOf("delete from public.money_moves\n  where source = 'tender_return'");
    const returnDelete = sql.indexOf("delete from public.guarantee_returns where guarantee_id");
    const guaranteeDelete = sql.indexOf("delete from public.tender_guarantees");
    expect(moveDelete).toBeGreaterThan(-1);
    expect(returnDelete).toBeGreaterThan(moveDelete);
    expect(guaranteeDelete).toBeGreaterThan(returnDelete);
  });

  it("keeps retries harmless when a row is already gone", () => {
    expect(sql.match(/if not found then return false; end if;/gi)?.length).toBeGreaterThanOrEqual(2);
  });

  it("checks permissions and blocks anonymous execution", () => {
    expect(sql).toMatch(/kd_has_permission\('action\.tenders_edit'\)/i);
    expect(sql).toMatch(/revoke all on function public\.delete_tender_guarantee_return_atomic\(uuid\) from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.delete_tender_guarantee_atomic\(uuid\) to authenticated, service_role/i);
  });
});
